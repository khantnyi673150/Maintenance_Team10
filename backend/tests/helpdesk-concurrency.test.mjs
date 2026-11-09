// Optional real PostgreSQL test: use an empty disposable database named helpdesk_test on loopback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

test("real PostgreSQL serializes duplicate API calls and a racing manual submission without extra audit/events", async () => {
  const url = new URL(process.env.HELPDESK_TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname === "/helpdesk_test",
    "Use a disposable loopback database named helpdesk_test; never a hosted database");
  assert.ok(process.env.PG_PACKAGE_ROOT);
  const require = createRequire(join(process.env.PG_PACKAGE_ROOT, "package.json"));
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: url.href, max: 6, statement_timeout: 4000 });
  try {
    const existing = await pool.query("select to_regclass('public.work_orders') as name");
    assert.equal(existing.rows[0].name, null, "The disposable test database must be empty");
    await pool.query(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
      grant usage on schema public,auth to anon,authenticated,service_role;`);
    for (const name of ["001_initial_schema", "002_api_policies_and_lifecycle", "003_atomic_create_and_start",
      "006_partner_webhook_events", "008_partner_work_orders", "009_security_hardening", "010_public_reporter_dashboard",
      "011_admin_manual_review", "012_public_manual_location_and_category", "013_manual_review_assignment",
      "014_public_student_identity_status", "015_helpdesk_integration", "016_helpdesk_direct_creation", "017_helpdesk_category"]) {
      if (name === "009_security_hardening") await pool.query("grant all on all tables in schema public to anon,authenticated,service_role");
      await pool.query(readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
    }
    const sql = "select public.create_helpdesk_work_order($1,'Air conditioner in B-204','Does not cool',null,'HVAC') as result";
    async function inServiceTransaction(query, args) {
      const client = await pool.connect();
      try {
        await client.query("begin; set local role service_role");
        const result = await client.query(query, args);
        await client.query("commit");
        return result;
      } catch (error) { await client.query("rollback"); throw error; }
      finally { client.release(); }
    }
    const firstClient = await pool.connect();
    try {
      await firstClient.query("begin; set local role service_role");
      const first = (await firstClient.query(sql, ["TKT-00012"])).rows[0].result;
      let completed = false;
      const second = inServiceTransaction(sql, ["TKT-00012"]).then((value) => { completed = true; return value; });
      await setTimeout(100);
      assert.equal(completed, false, "The duplicate waits for the first transaction to finish");
      await firstClient.query("commit");
      const duplicate = (await second).rows[0].result;
      assert.equal(first.duplicate, false);
      assert.equal(duplicate.duplicate, true);
      assert.deepEqual(duplicate.work_order, first.work_order);
      const counts = (await pool.query(`select
        (select count(*)::int from public.work_orders where ticket_ref='TKT-00012') as orders,
        (select count(*)::int from public.helpdesk_creation_requests where ticket_ref='TKT-00012') as receipts,
        (select count(*)::int from public.helpdesk_outbox where work_order_id=$1) as events,
        (select count(*)::int from public.status_history where work_order_id=$1) as history`, [first.work_order.id])).rows[0];
      assert.deepEqual(counts, { orders: 1, receipts: 1, events: 1, history: 1 });

      // The manual form does not acquire the API's advisory lock. Exercise the unique-index fallback.
      await firstClient.query("begin; set local role service_role");
      const manual = (await firstClient.query("select public.create_public_work_order('Manual repair','Air conditioner broken',null,'B-204','not_identified','TKT-00013') as result")).rows[0].result;
      completed = false;
      const racingApi = inServiceTransaction(sql, ["TKT-00013"]).then((value) => { completed = true; return value; });
      await setTimeout(100);
      assert.equal(completed, false);
      await firstClient.query("commit");
      const resolved = (await racingApi).rows[0].result;
      assert.equal(resolved.duplicate, true);
      assert.equal(resolved.work_order.id, manual.reference_number);
      assert.equal((await pool.query("select count(*)::int as n from public.helpdesk_outbox where work_order_id=$1", [manual.reference_number])).rows[0].n, 1);

      // Rollback of the first API transaction lets the waiting request create exactly one order.
      await firstClient.query("begin; set local role service_role");
      const abandoned = (await firstClient.query(sql, ["TKT-00014"])).rows[0].result;
      const waiting = inServiceTransaction(sql, ["TKT-00014"]);
      await setTimeout(100);
      await firstClient.query("rollback");
      const replacement = (await waiting).rows[0].result;
      assert.equal(replacement.duplicate, false);
      assert.notEqual(replacement.work_order.id, abandoned.work_order.id);
      assert.equal((await pool.query("select count(*)::int as n from public.work_orders where ticket_ref='TKT-00014'")).rows[0].n, 1);
    } finally { await firstClient.query("rollback"); firstClient.release(); }
  } finally { await pool.end(); }
});
