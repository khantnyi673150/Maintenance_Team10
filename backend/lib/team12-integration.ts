import "server-only";

import { createHmac, randomUUID } from "node:crypto";

const partnerActivitiesUrl =
  process.env.TEAM12_PARTNER_ACTIVITIES_URL ??
  "https://pd-project-events-clubs.onrender.com/partner/activities";
const partnerWebhookUrl =
  process.env.TEAM12_PARTNER_WEBHOOK_URL ??
  "https://pd-project-events-clubs.onrender.com/webhooks/partner";

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function fetchTeam12Activities(limit = 20): Promise<unknown> {
  const url = new URL(partnerActivitiesUrl);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Partner-Key": requiredSecret("TEAM12_PARTNER_API_KEY"),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Team 12 activity request failed with HTTP ${response.status}`);
  }

  return body;
}

export async function dispatchTeam12StatusChanged(input: {
  workOrderId: string;
  fromStatus: string;
  toStatus: string;
}): Promise<void> {
  const event = {
    id: randomUUID(),
    type: "maintenance.status_changed",
    occurredAt: new Date().toISOString(),
    data: input,
  };
  const body = JSON.stringify(event);
  const secret = requiredSecret("TEAM12_WEBHOOK_SECRET");
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  const response = await fetch(partnerWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": secret,
      "X-Webhook-Signature": `sha256=${signature}`,
      "X-Event-ID": event.id,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Team 12 webhook failed with HTTP ${response.status}`);
  }

  console.info("Team 12 webhook delivered", {
    eventId: event.id,
    status: response.status,
  });
}

export function dispatchStatusChangedWithoutBlocking(input: {
  workOrderId: string;
  fromStatus: string;
  toStatus: string;
}): void {
  void dispatchTeam12StatusChanged(input).catch((error: unknown) => {
    console.error("Team 12 webhook delivery failed", {
      workOrderId: input.workOrderId,
      toStatus: input.toStatus,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });
}