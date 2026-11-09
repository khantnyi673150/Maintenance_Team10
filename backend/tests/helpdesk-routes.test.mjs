import { test, after } from "node:test";
import assert from "node:assert/strict";
import { registerHooks, createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const nextServerUrl = pathToFileURL(require.resolve("next/server")).href;
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if (specifier === "next/server") return { url: nextServerUrl, shortCircuit: true };
  if (specifier.startsWith("@/")) return { url: new URL(specifier.slice(2) + ".ts", root).href, shortCircuit: true };
  if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !/\.[a-z]+$/i.test(specifier)) {
    return { url: new URL(specifier + ".ts", context.parentURL).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
} });
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "helpdesk-test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "helpdesk-test-service", HELPDESK_API_KEY: "helpdesk-test-lookup",
  HELPDESK_WORKER_SECRET: "helpdesk-test-worker", HELPDESK_WEBHOOK_SECRET: "helpdesk-test-signing",
  HELPDESK_WEBHOOK_URL: "https://helpdesk.invalid/api/v1/webhooks/maintenance",
});
const originalFetch = globalThis.fetch;
const id = "550e8400-e29b-41d4-a716-446655440000";
let lookupResult = { id, status: "IN_PROGRESS", ticket_ref: "TKT-00012", updated_at: "2026-11-09T03:00:00Z" };
let databaseFailure = false;
let pending = [];
const creationReceipts = new Map();
const calls = [];
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  assert.ok(["supabase.invalid", "helpdesk.invalid"].includes(url.hostname), "Never call a live service");
  const body = request.method === "POST" ? await request.json() : null;
  calls.push({ url, body, headers: request.headers });
  if (url.hostname === "helpdesk.invalid") return new Response(null, { status: 202 });
  if (url.pathname === "/auth/v1/user") return Response.json({ id, app_metadata: { role: "reporter" } });
  if (databaseFailure) return Response.json({ message: "private database failure", code: "XX000" }, { status: 500 });
  if (url.pathname === "/rest/v1/work_orders") return Response.json(lookupResult);
  if (url.pathname.endsWith("/create_public_work_order")) return Response.json({ reference_number: id });
  if (url.pathname.endsWith("/create_work_order")) return Response.json({ id });
  if (url.pathname.endsWith("/create_helpdesk_work_order")) {
    const existing = creationReceipts.get(body.p_ticket_ref);
    const workOrder = existing ?? { id, status: "OPEN", ticket_ref: body.p_ticket_ref, updated_at: "2026-11-09T03:00:00Z" };
    creationReceipts.set(body.p_ticket_ref, workOrder);
    return Response.json({ duplicate: !!existing, work_order: workOrder });
  }
  if (url.pathname.endsWith("/claim_helpdesk_event")) return Response.json(pending.splice(0, 1));
  if (url.pathname.endsWith("/finish_helpdesk_event")) return new Response(null, { status: 204 });
  throw new Error(`Unexpected database route ${url.pathname}`);
};
after(() => { globalThis.fetch = originalFetch; hooks.deregister(); });
const lookup = await import(new URL("app/api/v1/work-orders/[id]/route.ts", root));
const creation = await import(new URL("app/api/v1/work-orders/route.ts", root));
const worker = await import(new URL("app/api/integrations/helpdesk/deliver/route.ts", root));
const publicReports = await import(new URL("app/api/public/work-orders/route.ts", root));
const reports = await import(new URL("app/api/work-orders/route.ts", root));
const context = (value = id) => ({ params: Promise.resolve({ id: value }) });
function req(token, method = "GET", body) {
  return new Request("http://localhost/api/v1/work-orders/" + id, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", "X-Correlation-Id": "team14-t10-01" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("lookup fails closed before querying the database for missing, wrong or other-service credentials", async () => {
  const before = calls.length;
  for (const token of [undefined, "bad", "helpdesk-test-worker", "helpdesk-test-service"]) {
    assert.equal((await lookup.GET(req(token), context())).status, 401);
  }
  delete process.env.HELPDESK_API_KEY;
  try { assert.equal((await lookup.GET(req("helpdesk-test-lookup"), context())).status, 503); }
  finally { process.env.HELPDESK_API_KEY = "helpdesk-test-lookup"; }
  assert.equal(calls.length, before);
});
test("lookup accepts UUIDs, returns only Helpdesk metadata, echoes correlation and disables caching", async () => {
  const response = await lookup.GET(req("helpdesk-test-lookup"), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { id, status: "in_progress", ticketRef: "TKT-00012", updatedAt: "2026-11-09T03:00:00Z" } });
  assert.equal(response.headers.get("X-Correlation-Id"), "team14-t10-01");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const call = calls.at(-1);
  assert.equal(call.url.searchParams.get("select"), "id,status,ticket_ref,updated_at");
  assert.equal(call.url.searchParams.get("archived_at"), "is.null");
  assert.equal(call.url.searchParams.get("ticket_ref"), "not.is.null");
});
test("lookup handles malformed and unknown IDs and hides database error details", async () => {
  assert.equal((await lookup.GET(req("helpdesk-test-lookup"), context("TKT-12"))).status, 400);
  const saved = lookupResult;
  lookupResult = null;
  try { assert.equal((await lookup.GET(req("helpdesk-test-lookup"), context())).status, 404); }
  finally { lookupResult = saved; }
  databaseFailure = true;
  try {
    const response = await lookup.GET(req("helpdesk-test-lookup"), context());
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private database/);
  } finally { databaseFailure = false; }
});

test("direct creation uses the lookup credential, accepts the exact three-field request and returns lookup-shaped 201", async () => {
  const body = { ticketRef: "TKT-10001", title: "Air conditioner in room B-204 not working", description: "It does not cool and makes a noise." };
  const before = calls.length;
  for (const token of [undefined, "wrong-key", "helpdesk-test-worker", "helpdesk-test-service"]) {
    assert.equal((await creation.POST(req(token, "POST", body))).status, 401);
  }
  assert.equal(calls.length, before);
  const response = await creation.POST(req("helpdesk-test-lookup", "POST", body));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("X-Correlation-Id"), "team14-t10-01");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { data: { id, status: "reported", ticketRef: body.ticketRef, updatedAt: "2026-11-09T03:00:00Z" } });
  assert.deepEqual(calls.at(-1).body, { p_ticket_ref: body.ticketRef, p_title: body.title, p_description: body.description, p_location: null });
  assert.equal(calls.at(-1).headers.get("Authorization"), "Bearer helpdesk-test-service");
});

test("direct creation retries return the existing work order with 200 and optional location is forwarded", async () => {
  const body = { ticketRef: "TKT-10002", title: "Broken light", description: "The light is out.", location: "Building B, Room 204" };
  const first = await creation.POST(req("helpdesk-test-lookup", "POST", body));
  assert.equal(first.status, 201);
  assert.equal(calls.at(-1).body.p_location, body.location);
  const replay = await creation.POST(req("helpdesk-test-lookup", "POST", { ...body, title: "Changed on retry" }));
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), await first.json());
});

test("direct creation rejects missing, malformed and privileged fields with safe errors before RPC", async () => {
  const valid = { ticketRef: "TKT-10003", title: "Broken light", description: "The light is out." };
  const badBodies = [undefined, {}, { ...valid, ticketRef: "" }, { ...valid, title: " " },
    { ...valid, description: "" }, { ...valid, ticketRef: "WO-12" }, { ...valid, status: "CLOSED" },
    { ...valid, reporter_id: id }, { ...valid, location: "" }, { ...valid, title: "x".repeat(201) }];
  const before = calls.length;
  for (const body of badBodies) {
    const response = await creation.POST(req("helpdesk-test-lookup", "POST", body));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("X-Correlation-Id"), "team14-t10-01");
    const result = await response.json();
    assert.equal(typeof result.error.code, "string");
    assert.equal(typeof result.error.message, "string");
  }
  assert.equal(calls.length, before);
});

test("direct creation fails closed when unconfigured and permits safe retries after a database outage", async () => {
  const body = { ticketRef: "TKT-10004", title: "Broken light", description: "The light is out." };
  delete process.env.HELPDESK_API_KEY;
  try { assert.equal((await creation.POST(req("helpdesk-test-lookup", "POST", body))).status, 503); }
  finally { process.env.HELPDESK_API_KEY = "helpdesk-test-lookup"; }
  databaseFailure = true;
  try {
    const response = await creation.POST(req("helpdesk-test-lookup", "POST", body));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private database/);
  } finally { databaseFailure = false; }
});
test("public and authenticated creation pass ticketRef only when supplied; old requests remain unchanged", async () => {
  const publicBody = { title: "Broken light", description: "The lamp does not turn on", category: "Electrical", location: "C1" };
  for (const ticketRef of [undefined, "TKT-00012"]) {
    assert.equal((await publicReports.POST(req(undefined, "POST", { ...publicBody, ticketRef }))).status, 201);
    assert.equal(calls.at(-1).body.p_ticket_ref, ticketRef);
    assert.equal((await reports.POST(req("reporter-token", "POST", {
      title: "Broken light", description: "Not working", category_id: id, location_id: id, ticketRef,
    }))).status, 201);
    assert.equal(calls.at(-1).body.p_ticket_ref, ticketRef);
  }
  const before = calls.length;
  assert.equal((await publicReports.POST(req(undefined, "POST", { ...publicBody, ticketRef: "WO-12" }))).status, 400);
  assert.equal(calls.length, before);
});
test("worker has an independent credential and does not claim events without valid receiver config", async () => {
  const before = calls.length;
  assert.equal((await worker.GET(req("helpdesk-test-lookup"))).status, 401);
  delete process.env.HELPDESK_WEBHOOK_URL;
  try { assert.equal((await worker.GET(req("helpdesk-test-worker"))).status, 503); }
  finally { process.env.HELPDESK_WEBHOOK_URL = "https://helpdesk.invalid/api/v1/webhooks/maintenance"; }
  assert.equal(calls.length, before);
});
test("actual worker route claims durable events, sends signed body, and saves acknowledgements", async () => {
  const body = JSON.stringify({ eventId: id, type: "maintenance.status_changed", data: { workOrderId: id, status: "OPEN" } });
  pending = [{ event_id: id, lease_token: id, body }];
  const response = await worker.GET(req("helpdesk-test-worker"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processed: 1, delivered: 1 });
  const sent = calls.findLast((call) => call.url.hostname === "helpdesk.invalid");
  assert.equal(sent.headers.get("X-Correlation-Id"), id);
  assert.match(sent.headers.get("X-Signature"), /^[0-9a-f]{64}$/);
  const ack = calls.findLast((call) => call.url.pathname.endsWith("/finish_helpdesk_event"));
  assert.deepEqual(ack.body, { p_event_id: id, p_lease_token: id, p_http_status: 202 });
});
