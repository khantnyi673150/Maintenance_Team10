import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { helpdeskHeaders, sendHelpdeskEvent, drainHelpdeskQueue, toHelpdeskStatus } from "../lib/helpdesk-delivery.ts";
import { createPublicWorkOrderSchema, createWorkOrderSchema } from "../lib/work-order-schemas.ts";

const event = {
  eventId: "7f3c2a9e-1b4d-4c8e-9a21-5d6e7f8a9b01", type: "maintenance.status_changed",
  occurredAt: "2026-11-09T03:00:00Z", source: "maintenance", subject: "work-order:550e8400-e29b-41d4-a716-446655440000",
  data: { workOrderId: "550e8400-e29b-41d4-a716-446655440000", ticketRef: "TKT-00012",
    previousStatus: "assigned", status: "in_progress", changedAt: "2026-11-09T03:00:00Z" },
};
const body = JSON.stringify(event);
const secret = "local-helpdesk-signing-fixture";

test("Helpdesk adapter preserves internal status names and exposes the draft contract vocabulary", () => {
  assert.deepEqual(["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].map(toHelpdeskStatus),
    ["reported", "assigned", "in_progress", "completed", "closed"]);
  assert.throws(() => toHelpdeskStatus("CANCELLED"));
  assert.throws(() => toHelpdeskStatus("toString"));
});

test("timestamp signing matches Team 14 formula; retries keep event bytes and refresh signature", () => {
  const first = helpdeskHeaders(body, secret, event.eventId, 1_800_000_000_000);
  const second = helpdeskHeaders(body, secret, event.eventId, 1_800_000_060_000);
  assert.equal(first.get("X-Timestamp"), "1800000000");
  assert.equal(first.get("X-Signature"), createHmac("sha256", secret).update(`1800000000.${body}`).digest("hex"));
  assert.notEqual(first.get("X-Signature"), second.get("X-Signature"));
  assert.equal(first.get("X-Webhook-Secret"), null);
  assert.equal(first.get("X-Correlation-Id"), event.eventId);
});

test("real HTTP receiver validates the exact signature, event envelope and stable duplicate ID", async () => {
  const seen = new Set<string>();
  const received: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const timestamp = req.headers["x-timestamp"];
    const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
    if (signature !== req.headers["x-signature"] || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      res.writeHead(401).end(); return;
    }
    const value = JSON.parse(raw);
    received.push(raw);
    seen.add(value.eventId);
    res.writeHead(200).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    const url = `http://127.0.0.1:${address.port}/api/v1/webhooks/maintenance`;
    assert.equal(await sendHelpdeskEvent(body, event.eventId, url, secret), 200);
    assert.equal(await sendHelpdeskEvent(body, event.eventId, url, secret), 200);
    assert.deepEqual(received, [body, body]);
    assert.equal(seen.size, 1);
    assert.equal(await sendHelpdeskEvent(body, event.eventId, url, "wrong-secret"), 401);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("real HTTP timeout returns retryable network outcome within the three-second deadline", async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const start = performance.now();
    assert.equal(await sendHelpdeskEvent(body, event.eventId, `http://127.0.0.1:${address.port}`, secret), null);
    assert.ok(performance.now() - start < 4500);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("delivery forbids credential-bearing URLs, external HTTP and redirect forwarding", async () => {
  await assert.rejects(sendHelpdeskEvent(body, event.eventId, "http://helpdesk.example/webhook", secret));
  await assert.rejects(sendHelpdeskEvent(body, event.eventId, "https://user:pass@helpdesk.example", secret));
  let init: RequestInit | undefined;
  await sendHelpdeskEvent(body, event.eventId, "https://helpdesk.example/webhook", secret,
    (async (_url, options) => { init = options; return new Response(null, { status: 202 }); }) as typeof fetch);
  assert.equal(init?.redirect, "error");
  assert.ok(init?.signal instanceof AbortSignal);
});

test("worker records every result and treats only 200 and 202 as acknowledgements", async () => {
  for (const status of [200, 202, 400, 401, 503, null]) {
    let claimed = false;
    const finished: (number | null)[] = [];
    const result = await drainHelpdeskQueue({
      async claim() { if (claimed) return null; claimed = true; return { event_id: event.eventId, body, lease_token: "lease" }; },
      async finish(_event, outcome) { finished.push(outcome); },
    }, "https://helpdesk.example/webhook", secret, (async () => {
      if (status === null) throw new Error("timeout");
      return new Response(null, { status });
    }) as typeof fetch);
    assert.deepEqual(finished, [status]);
    assert.deepEqual(result, { processed: 1, delivered: status === 200 || status === 202 ? 1 : 0 });
  }
});

test("invalid receiver config never claims a queued event and acknowledgement failures surface", async () => {
  let claims = 0;
  const queue = {
    async claim() { claims++; return { event_id: event.eventId, body, lease_token: "lease" }; },
    async finish() { throw new Error("DB unavailable"); },
  };
  await assert.rejects(drainHelpdeskQueue(queue, "http://external.example", secret));
  assert.equal(claims, 0);
  await assert.rejects(drainHelpdeskQueue(queue, "https://helpdesk.example", secret,
    (async () => new Response(null, { status: 200 })) as typeof fetch), /DB unavailable/);
});

test("reference validation is optional and rejects foreign IDs, malformed references and injected fields", () => {
  const report = { title: "Broken light", description: "The lamp is out", location: "C1", category: "Electrical" };
  assert.equal(createPublicWorkOrderSchema.safeParse(report).success, true);
  assert.equal(createPublicWorkOrderSchema.parse({ ...report, ticketRef: " TKT-00012 " }).ticketRef, "TKT-00012");
  for (const ticketRef of ["WO-12", "TKT-", "TKT-<script>", "TKT-12\nforged", "", "TKT-" + "1".repeat(59)]) {
    assert.equal(createPublicWorkOrderSchema.safeParse({ ...report, ticketRef }).success, false);
  }
  assert.equal(createWorkOrderSchema.safeParse({ title: "Test", description: "Test",
    location_id: event.data.workOrderId, category_id: event.data.workOrderId, ticketRef: "TKT-00012" }).success, true);
  assert.equal(createPublicWorkOrderSchema.safeParse({ ...report, status: "CLOSED" }).success, false);
});
