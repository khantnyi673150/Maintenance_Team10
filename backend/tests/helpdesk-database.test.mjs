// Isolated PostgreSQL integration tests. No hosted database or partner is contacted.
// Install @electric-sql/pglite@0.3.15 outside the repo and set PGLITE_PACKAGE_ROOT.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { drainHelpdeskQueue } from "../lib/helpdesk-delivery.ts";

test("Helpdesk migration, atomic outbox, permissions, lease recovery and real HTTP retries", async () => {
  assert.ok(process.env.PGLITE_PACKAGE_ROOT, "Set PGLITE_PACKAGE_ROOT to the temporary validation installation");
  const require = createRequire(join(process.env.PGLITE_PACKAGE_ROOT, "package.json"));
  const { PGlite } = require("@electric-sql/pglite");
  const db = new PGlite();
  const secret = "isolated-db-helpdesk-secret";
  let receiverStatus = 503;
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const expected = createHmac("sha256", secret).update(`${req.headers['x-timestamp']}.${raw}`).digest("hex");
    if (expected !== req.headers["x-signature"]) { res.writeHead(401).end(); return; }
    received.push({ body: raw, event: JSON.parse(raw) });
    res.writeHead(receiverStatus).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const target = `http://127.0.0.1:${server.address().port}/api/v1/webhooks/maintenance`;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;`);
    const migrations = ["001_initial_schema", "002_api_policies_and_lifecycle", "003_atomic_create_and_start",
      "006_partner_webhook_events", "008_partner_work_orders", "009_security_hardening", "010_public_reporter_dashboard",
      "011_admin_manual_review", "012_public_manual_location_and_category", "013_manual_review_assignment",
      "014_public_student_identity_status", "015_helpdesk_integration"];
    for (const name of migrations) {
      if (name === "009_security_hardening") await db.exec("grant all on all tables in schema public to anon,authenticated,service_role");
      const sql = readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8")
        .replace('create extension if not exists "pgcrypto";', "");
      await db.exec(sql);
    }
    const staff = "00000000-0000-4000-8000-000000000001";
    const reporter = "00000000-0000-4000-8000-000000000002";
    const category = (await db.query("select id from public.categories where name='Electrical'")).rows[0].id;
    const location = "00000000-0000-4000-8000-000000000004";
    await db.query("insert into auth.users(id,raw_app_meta_data) values($1,'{\"role\":\"staff\"}'),($2,'{\"role\":\"reporter\"}')", [staff, reporter]);
    await db.query("insert into public.locations(id,building,floor_room) values($1,'C1','204')", [location]);
    const asRole = (role, sql, args = [], user = null) => db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      if (user) await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user })]);
      return tx.query(sql, args);
    });
    const service = (sql, args) => asRole("service_role", sql, args);
    const actor = (user, sql, args) => asRole("authenticated", sql, args, user);
    const create = (ref) => service("select public.create_public_work_order('Light failure','The room lamp does not work','Electrical','C1','not_identified',$1) as result", [ref]);
    const count = async (id) => (await db.query("select count(*)::int as n from public.helpdesk_outbox where work_order_id=$1", [id])).rows[0].n;

    // Older requests and other integrations create no Helpdesk events.
    const legacy = (await service("select public.create_public_work_order('Old request','A broken lamp','Electrical','C1','not_identified') as result")).rows[0].result;
    assert.equal(await count(legacy.reference_number), 0);
    const legacyAuth = (await actor(reporter, "select * from public.create_work_order($1,$2,'Broken lamp',$3,'Old API')", [reporter, location, category])).rows[0];
    assert.equal(await count(legacyAuth.id), 0);
    const partner = (await service("select public.create_partner_work_order('Partner setup','Set up room',$1,$2,'activity-helpdesk-regression','idem-helpdesk-regression') as result", [category, location])).rows[0].result;
    assert.equal(await count(partner.work_order.id), 0);

    // New authenticated and public creation are atomic, and references are validated in SQL too.
    const authenticated = (await actor(reporter,
      "select * from public.create_work_order($1,$2,'Broken lamp',$3,'Helpdesk repair','TKT-00011')", [reporter, location, category])).rows[0];
    assert.equal(authenticated.ticket_ref, "TKT-00011");
    assert.equal(await count(authenticated.id), 1);
    await assert.rejects(create("WO-12"));
    const created = (await create("TKT-00012")).rows[0].result;
    const id = created.reference_number;
    assert.equal(created.student_identity_status, "not_identified");
    assert.equal(await count(id), 1);
    await assert.rejects(create("TKT-00012"), { code: "23505" });
    assert.equal(await count(id), 1);
    await assert.rejects(asRole("anon", "select * from public.helpdesk_outbox"));
    await assert.rejects(actor(reporter, "select * from public.helpdesk_outbox"));
    await assert.rejects(actor(reporter, "select public.claim_helpdesk_event()"));
    await assert.rejects(actor(reporter, "select public.create_public_work_order('X','Y','Electrical','C1','identified','TKT-999')"));
    await assert.rejects(service("update public.work_orders set ticket_ref='TKT-999' where id=$1", [id]));

    // Failed state transitions cannot leave a ghost webhook behind.
    await assert.rejects(actor(reporter, "select public.assign_work_order($1,$2)", [id, staff]));
    await assert.rejects(actor(staff, "update public.work_orders set status='RESOLVED',resolution_notes='skip' where id=$1", [id]));
    assert.equal(await count(id), 1);
    await actor(staff, "select public.assign_work_order($1,$2)", [id, staff]);
    await actor(staff, "select public.start_work_order($1)", [id]);
    await assert.rejects(actor(staff, "select public.resolve_work_order($1,' ')", [id]));
    await actor(staff, "select public.resolve_work_order($1,'Lamp replaced')", [id]);
    await actor(staff, "select public.close_work_order($1)", [id]);
    assert.equal(await count(id), 5);
    const events = (await db.query("select body from public.helpdesk_outbox where work_order_id=$1 order by sequence", [id])).rows.map((row) => JSON.parse(row.body));
    assert.deepEqual(events.map((e) => e.data.status), ["reported", "assigned", "in_progress", "completed", "closed"]);
    assert.equal(events[0].data.previousStatus, null);
    assert.equal(events[4].data.previousStatus, "completed");
    for (const e of events) {
      assert.deepEqual(Object.keys(e.data).sort(), ["changedAt", "previousStatus", "status", "ticketRef", "workOrderId"]);
      assert.equal(e.subject, `work-order:${id}`);
      assert.equal(e.occurredAt, e.data.changedAt);
      assert.doesNotMatch(JSON.stringify(e), /Lamp replaced|Broken lamp|reporter_id|student_identity_status/);
    }

    const queue = () => ({
      async claim() { return (await service("select * from public.claim_helpdesk_event()")).rows[0] ?? null; },
      async finish(event, status) {
        await service("select public.finish_helpdesk_event($1,$2,$3)", [event.event_id, event.lease_token, status]);
      },
    });
    // All actual HTTP attempts fail with 503; each pending first event blocks later statuses.
    const failed = await drainHelpdeskQueue(queue(), target, secret);
    assert.equal(failed.delivered, 0);
    assert.equal(failed.processed, 2);
    const first = (await db.query("select * from public.helpdesk_outbox where work_order_id=$1 and sequence=1", [id])).rows[0];
    assert.equal(first.state, "pending");
    assert.equal(first.attempts, 1);
    assert.equal(first.last_http_status, 503);
    assert.ok(new Date(first.available_at).getTime() - Date.now() > 50_000);
    assert.equal(await queue().claim(), null);
    // A new worker invocation recovers the same stored event and exact bytes.
    await db.exec("update public.helpdesk_outbox set available_at=now() where state='pending'");
    receiverStatus = 200;
    const recovered = await drainHelpdeskQueue(queue(), target, secret);
    assert.equal(recovered.delivered, 6);
    const copies = received.filter((r) => r.event.eventId === first.event_id);
    assert.equal(copies.length, 2);
    assert.equal(copies[0].body, copies[1].body);
    assert.equal((await db.query("select state from public.helpdesk_outbox where event_id=$1", [first.event_id])).rows[0].state, "delivered");

    // Lease recovery, fencing and the full 1 / 5 / 30 minute retry schedule.
    await create("TKT-00013");
    const lease1 = await queue().claim();
    assert.equal(await queue().claim(), null, "Another worker cannot claim an active lease");
    await db.query("update public.helpdesk_outbox set leased_until=now()-interval '1 second' where event_id=$1", [lease1.event_id]);
    const lease2 = await queue().claim();
    assert.equal(lease2.event_id, lease1.event_id);
    assert.notEqual(lease2.lease_token, lease1.lease_token);
    await assert.rejects(queue().finish(lease1, 200), { code: "40001" });
    await queue().finish(lease2, 503);
    const delay5 = (await db.query("select extract(epoch from available_at-now())::int as delay from public.helpdesk_outbox where event_id=$1", [lease2.event_id])).rows[0].delay;
    assert.ok(delay5 >= 299 && delay5 <= 300);
    await db.exec("update public.helpdesk_outbox set available_at=now() where state='pending'");
    const lease3 = await queue().claim();
    await queue().finish(lease3, null);
    const delay30 = (await db.query("select extract(epoch from available_at-now())::int as delay from public.helpdesk_outbox where event_id=$1", [lease3.event_id])).rows[0].delay;
    assert.ok(delay30 >= 1799 && delay30 <= 1800);
    await db.exec("update public.helpdesk_outbox set available_at=now() where state='pending'");
    const lease4 = await queue().claim();
    await queue().finish(lease4, 503);
    assert.equal((await db.query("select state from public.helpdesk_outbox where event_id=$1", [lease4.event_id])).rows[0].state, "failed");
    assert.equal(await queue().claim(), null);
    for (const [ref, status] of [["TKT-00014", 401], ["TKT-00015", 400], ["TKT-00016", 202]]) {
      await create(ref);
      const leased = await queue().claim();
      await queue().finish(leased, status);
      const state = (await db.query("select state from public.helpdesk_outbox where event_id=$1", [leased.event_id])).rows[0].state;
      assert.equal(state, status === 202 ? "delivered" : "failed");
    }
    await create("TKT-00017");
    let crashed;
    for (let attempt = 1; attempt <= 4; attempt++) {
      crashed = await queue().claim();
      assert.equal(crashed.attempts, attempt);
      await db.query("update public.helpdesk_outbox set leased_until=now()-interval '1 second' where event_id=$1", [crashed.event_id]);
    }
    assert.equal(await queue().claim(), null, "An expired final lease is retired instead of stuck pending");
    assert.equal((await db.query("select state from public.helpdesk_outbox where event_id=$1", [crashed.event_id])).rows[0].state, "failed");
    const outboxBeforeRollback = (await db.query("select count(*)::int as n from public.helpdesk_outbox")).rows[0].n;
    await assert.rejects(db.transaction(async (tx) => {
      await tx.query("select public.create_public_work_order('Repair','Broken lamp','Electrical','C1','not_identified','TKT-00018')");
      throw new Error("Rollback creation");
    }), /Rollback creation/);
    assert.equal((await db.query("select count(*)::int as n from public.helpdesk_outbox")).rows[0].n, outboxBeforeRollback);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
    await db.close();
  }
});
