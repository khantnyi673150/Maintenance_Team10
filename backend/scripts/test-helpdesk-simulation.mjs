import assert from "node:assert/strict";
import { sendHelpdeskEvent } from "../lib/helpdesk-delivery.ts";

const base = process.env.HELPDESK_SIMULATION_URL ?? "http://127.0.0.1:4514";
const event = {
  eventId: "7f3c2a9e-1b4d-4c8e-9a21-5d6e7f8a9b01",
  type: "maintenance.status_changed", occurredAt: "2026-11-09T03:00:00Z", source: "maintenance",
  subject: "work-order:550e8400-e29b-41d4-a716-446655440000",
  data: { workOrderId: "550e8400-e29b-41d4-a716-446655440000", ticketRef: "TKT-00012",
    previousStatus: "assigned", status: "in_progress", changedAt: "2026-11-09T03:00:00Z" },
};
for (const [route, expected] of [["helpdesk", 200], ["helpdesk-error", 500], ["helpdesk-timeout", null]]) {
  const start = performance.now();
  const status = await sendHelpdeskEvent(JSON.stringify(event), event.eventId,
    `${base}/${route}/api/v1/webhooks/maintenance`, "local-simulation-fixture-secret");
  assert.equal(status, expected);
  console.info("Helpdesk simulation scenario passed", { scenario: route, status, elapsedMs: Math.round(performance.now() - start) });
}
