import { errorResponse } from "@/lib/api";
import { isConfiguredSecret, secretsMatch } from "@/lib/security";
import { runHelpdeskWorker } from "@/lib/helpdesk-worker";
import { partnerUrl } from "@/lib/webhook-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A scheduler calls this protected endpoint every minute. It never accepts a target URL from callers.
export async function GET(request: Request) {
  if (!isConfiguredSecret(process.env.HELPDESK_WORKER_SECRET)) {
    return errorResponse(503, "WORKER_NOT_CONFIGURED", "Helpdesk delivery is not configured");
  }
  const auth = request.headers.get("Authorization");
  if (!secretsMatch(auth?.startsWith("Bearer ") ? auth.slice(7) : null, process.env.HELPDESK_WORKER_SECRET)) {
    return errorResponse(401, "UNAUTHENTICATED", "A valid delivery credential is required");
  }
  const target = process.env.HELPDESK_WEBHOOK_URL;
  const secret = process.env.HELPDESK_WEBHOOK_SECRET;
  if (!target || !isConfiguredSecret(secret)) {
    return errorResponse(503, "HELPDESK_NOT_CONFIGURED", "Helpdesk receiver is not configured");
  }
  try { partnerUrl(target); } catch {
    return errorResponse(503, "HELPDESK_NOT_CONFIGURED", "Helpdesk receiver configuration is invalid");
  }
  try {
    return Response.json(await runHelpdeskWorker(target, secret), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(503, "DELIVERY_UNAVAILABLE", "Helpdesk delivery will resume on the next worker run");
  }
}
