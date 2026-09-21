import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function validSecret(provided: string | null): boolean {
  const expected = process.env.TEAM10_WEBHOOK_SECRET;
  if (!expected || !provided) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  if (!validSecret(request.headers.get("x-webhook-secret"))) {
    return errorResponse(401, "INVALID_WEBHOOK_SECRET", "Webhook secret is invalid");
  }

  const eventId = request.headers.get("x-event-id");
  if (!eventId) return errorResponse(400, "MISSING_EVENT_ID", "X-Event-ID is required");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Webhook body must be valid JSON");
  }

  const supabase = createSupabaseAdminClient();
  const { data: existing, error: lookupError } = await supabase
    .from("partner_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (lookupError) return errorResponse(500, "WEBHOOK_STORAGE_ERROR", lookupError.message);
  if (existing) {
    return Response.json({ received: true, duplicate: true, eventId });
  }

  const { error: insertError } = await supabase.from("partner_webhook_events").insert({
    event_id: eventId,
    event_type:
      typeof payload === "object" && payload !== null && "type" in payload
        ? String(payload.type)
        : "unknown",
    payload,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return Response.json({ received: true, duplicate: true, eventId });
    }
    return errorResponse(500, "WEBHOOK_STORAGE_ERROR", insertError.message);
  }

  return Response.json({ received: true, duplicate: false, eventId }, { status: 201 });
}