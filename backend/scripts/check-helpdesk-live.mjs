// Readiness and lookup checks. This script never creates a work order or changes a status.
const report = { checkedAt: new Date().toISOString(), testTicket: "TKT-00012" };
const workerUrl = new URL(process.env.HELPDESK_WORKER_URL);
if (workerUrl.protocol !== "https:" || workerUrl.username || workerUrl.password) throw new Error("Invalid backend URL");
const backendOrigin = workerUrl.origin;
const receiver = new URL(process.env.HELPDESK_WEBHOOK_URL);
if (receiver.protocol !== "https:" || receiver.username || receiver.password) throw new Error("Invalid receiver URL");

async function probe(url, init = {}) {
  try {
    const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
    const status = response.status;
    const platformError = response.headers.get("x-vercel-error");
    const body = response.headers.get("content-type")?.includes("application/json")
      ? await response.json().catch(() => null) : null;
    await response.body?.cancel().catch(() => {});
    return { status, platformError, body };
  } catch { return { status: null, platformError: "NETWORK_FAILURE", body: null }; }
}
const backend = await probe(`${backendOrigin}/api/health`);
report.backend = { status: backend.status, platformError: backend.platformError };
// An empty, unsigned request cannot create a valid event or modify a ticket.
// 400 or 401 establishes that the POST handler is reachable, not that signing is configured.
const receiverProbe = await probe(receiver, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
report.receiver = { status: receiverProbe.status, handlerReachable: [400, 401].includes(receiverProbe.status) };

const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (dbUrl && serviceKey) {
  const url = new URL("/rest/v1/work_orders", dbUrl);
  url.searchParams.set("select", "id,status,ticket_ref,updated_at");
  url.searchParams.set("ticket_ref", "eq.TKT-00012");
  url.searchParams.set("archived_at", "is.null");
  url.searchParams.set("limit", "2");
  const db = await probe(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  const records = Array.isArray(db.body) ? db.body : [];
  report.database = { status: db.status, ticketReferenceColumnAvailable: db.status === 200, matchingWorkOrders: records.length };
  if (records.length === 1) {
    report.workOrderId = records[0].id;
    if (backend.status === 200) {
      const lookup = await probe(`${backendOrigin}/api/v1/work-orders/${records[0].id}`, {
        headers: { Authorization: `Bearer ${process.env.HELPDESK_API_KEY}`, "X-Correlation-Id": "team14-t10-01" },
      });
      report.lookup = { status: lookup.status, idMatches: lookup.body?.data?.id === records[0].id,
        ticketMatches: lookup.body?.data?.ticketRef === "TKT-00012", statusValue: lookup.body?.data?.status };
    }
  }
  const outbox = await probe(new URL("/rest/v1/helpdesk_outbox?select=state,attempts,last_http_status&limit=100", dbUrl),
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  report.outbox = { status: outbox.status, migrationAvailable: outbox.status === 200,
    sampledEvents: Array.isArray(outbox.body) ? outbox.body.length : null };
} else { report.database = { configured: false }; }
report.readyForLiveTest = backend.status === 200 && report.receiver.handlerReachable && report.outbox?.migrationAvailable === true;
console.log(JSON.stringify(report, null, 2));
if (!report.readyForLiveTest) process.exitCode = 2;
