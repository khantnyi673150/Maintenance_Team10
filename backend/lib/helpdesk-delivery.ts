import { createHmac } from "node:crypto";
import { partnerUrl } from "./webhook-delivery.ts";

export const HELPDESK_TIMEOUT_MS = 3000;

const statuses: Record<string, string> = {
  OPEN: "reported", ASSIGNED: "assigned", IN_PROGRESS: "in_progress", RESOLVED: "completed", CLOSED: "closed",
};
export function toHelpdeskStatus(status: string): string {
  if (!Object.hasOwn(statuses, status)) throw new Error("Unknown Maintenance status");
  return statuses[status];
}

// The stored body and eventId never change between attempts. Only signing time changes.
export function helpdeskHeaders(body: string, secret: string, correlationId: string, now = Date.now()): Headers {
  const timestamp = String(Math.floor(now / 1000));
  return new Headers({
    "Content-Type": "application/json",
    "X-Correlation-Id": correlationId,
    "X-Timestamp": timestamp,
    "X-Signature": createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex"),
  });
}

export async function sendHelpdeskEvent(
  body: string, eventId: string, target: string, secret: string,
  transport: typeof fetch = fetch,
): Promise<number | null> {
  // Validate configuration outside the network catch: bad configuration is not a timeout.
  const url = partnerUrl(target);
  const headers = helpdeskHeaders(body, secret, eventId);
  try {
    const response = await transport(url, {
      method: "POST", body, headers, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(HELPDESK_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null; // Network failure or timeout: the durable queue schedules the next attempt.
  }
}

type Delivery = { event_id: string; body: string; lease_token: string };
export type HelpdeskQueue = {
  claim(): Promise<Delivery | null>;
  finish(event: Delivery, status: number | null): Promise<void>;
};

export async function drainHelpdeskQueue(queue: HelpdeskQueue, target: string, secret: string,
  transport: typeof fetch = fetch, limit = 10) {
  partnerUrl(target);
  let processed = 0;
  let delivered = 0;
  for (; processed < limit; processed++) {
    const event = await queue.claim();
    if (!event) break;
    const status = await sendHelpdeskEvent(event.body, event.event_id, target, secret, transport);
    await queue.finish(event, status);
    if (status === 200 || status === 202) delivered++;
  }
  return { processed, delivered };
}
