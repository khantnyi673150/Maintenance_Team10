// Real PostgreSQL SQL/transaction/permission tests, with stand-ins for Supabase's
// managed pg_net, Vault and pg_cron extensions. No hosted service is contacted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('cloud dispatch: enqueue, rollback, retries, pauses, secrets and permissions', async () => {
  assert.ok(process.env.PGLITE_PACKAGE_ROOT, 'Set PGLITE_PACKAGE_ROOT to the temporary PGlite installation');
  const require = createRequire(join(process.env.PGLITE_PACKAGE_ROOT, 'package.json'));
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema maintenance_private; create schema vault; create schema net; create schema cron;
      grant usage on schema maintenance_private to authenticated;
      create table public.helpdesk_outbox (
        event_id uuid default gen_random_uuid(), work_order_id uuid default gen_random_uuid(),
        sequence int default 1, state text default 'pending', available_at timestamptz default now(),
        leased_until timestamptz, attempts int default 0
      );
      create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
      create table net.requests(id bigserial primary key, url text, headers jsonb, timeout_ms int);
      create function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}',
        timeout_milliseconds int default 2000) returns bigint language sql as $$
        insert into net.requests(url,headers,timeout_ms) values(url,headers,timeout_milliseconds) returning id;
      $$;
      create table cron.job(jobid bigserial primary key, jobname text, schedule text, command text);
      create function cron.schedule(job_name text, job_schedule text, job_command text)
        returns bigint language sql as $$
        insert into cron.job(jobname,schedule,command) values(job_name,job_schedule,job_command) returning jobid;
      $$;
    `);
    // PGlite cannot load Supabase's background extensions. Test the shipped SQL
    // against matching SQL interfaces; real network execution needs live QA.
    const migration = readFileSync(new URL('../supabase/migrations/019_helpdesk_cloud_delivery.sql', import.meta.url), 'utf8');
    await db.exec(migration.replace(/^create extension .*;$/gm, ''));
    const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
    const requests = () => scalar('select count(*)::int from net.requests');
    const reset = () => db.exec(`update maintenance_private.helpdesk_cloud_delivery set last_requested_at=null;
      delete from net.requests; delete from public.helpdesk_outbox;`);

    assert.equal(await scalar('select enabled from maintenance_private.helpdesk_cloud_delivery'), false);
    assert.equal(await scalar("select schedule from cron.job where jobname='maintenance-helpdesk-delivery'"), '* * * * *');
    assert.equal(await scalar('select command from cron.job'), 'select maintenance_private.request_helpdesk_delivery();');
    await db.exec('insert into public.helpdesk_outbox default values;');
    assert.equal(await requests(), 0, 'disabled migration cannot accidentally start production deliveries');
    await db.exec('update maintenance_private.helpdesk_cloud_delivery set enabled=true;');
    assert.equal(await scalar('select maintenance_private.request_helpdesk_delivery()'), null, 'missing secret retains event');
    await db.exec("insert into vault.decrypted_secrets values('maintenance_helpdesk_worker_secret','isolated-worker-secret-019');");
    await reset();
    assert.equal(await scalar('select maintenance_private.request_helpdesk_delivery()'), null, 'idle cron does no HTTP work');

    await db.exec('insert into public.helpdesk_outbox default values;');
    assert.equal(await requests(), 1, 'new event immediately queues worker request');
    const request = (await db.query('select * from net.requests')).rows[0];
    assert.equal(request.url, 'https://maintenance-team10.vercel.app/api/integrations/helpdesk/deliver');
    assert.equal(request.headers.Authorization, 'Bearer isolated-worker-secret-019');
    assert.equal(request.timeout_ms, 55000);
    assert.doesNotMatch(await scalar('select command from cron.job'), /isolated-worker-secret/);
    await db.exec('insert into public.helpdesk_outbox default values;');
    assert.equal(await requests(), 1, 'burst kicks coalesce; remaining work stays queued for cron');

    await reset();
    await db.exec('begin; insert into public.helpdesk_outbox default values; rollback;');
    assert.equal(await requests(), 0, 'rollback also rolls back queued HTTP request');
    assert.equal(await scalar('select count(*)::int from public.helpdesk_outbox'), 0);

    await db.exec("insert into public.helpdesk_outbox(available_at) values(now()+interval '5 minutes');");
    assert.equal(await requests(), 0, 'future retry is not sent early');
    await db.exec("update public.helpdesk_outbox set available_at=now(); select maintenance_private.request_helpdesk_delivery();");
    assert.equal(await requests(), 1, 'cron sends a due retry without any new user request');
    await reset();
    await db.exec("insert into public.helpdesk_outbox(leased_until) values(now()+interval '1 minute');");
    assert.equal(await requests(), 0, 'active lease is left alone');
    await db.exec(`update public.helpdesk_outbox set leased_until=now()-interval '1 second', attempts=4;
      select maintenance_private.request_helpdesk_delivery();`);
    assert.equal(await requests(), 1, 'worker is woken to retire exhausted leases');
    await reset();
    await db.exec(`insert into public.helpdesk_outbox(work_order_id,sequence,available_at) values
      ('00000000-0000-4000-8000-000000000001',1,now()+interval '5 minutes'),
      ('00000000-0000-4000-8000-000000000001',2,now());`);
    assert.equal(await requests(), 0, 'later status cannot bypass earlier pending status');

    await reset();
    await db.exec(`create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}',
      timeout_milliseconds int default 2000) returns bigint language plpgsql as $$
      begin raise exception 'simulated queue failure'; end; $$;
      insert into public.helpdesk_outbox default values;`);
    assert.equal(await scalar('select count(*)::int from public.helpdesk_outbox'), 1, 'HTTP queue failure cannot lose repair event');
    assert.equal(await requests(), 0);
    await assert.rejects(db.exec("update maintenance_private.helpdesk_cloud_delivery set endpoint='https://evil.example/?secret=x';"));
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const sql of ['select maintenance_private.request_helpdesk_delivery()',
        'select * from maintenance_private.helpdesk_cloud_delivery']) {
        await assert.rejects(db.transaction(async tx => {
          await tx.exec(`set local role ${role}`);
          await tx.exec(sql);
        }), `${role} must not configure or invoke the scheduler`);
      }
    }
  } finally { await db.close(); }
});
