import "server-only";
import { randomUUID } from "node:crypto";
import { isConfiguredSecret, secretsMatch } from "./security.ts";
import { toHelpdeskStatus } from "./helpdesk-delivery.ts";

export function authorizeHelpdesk(request: Request) {
  const supplied = request.headers.get("X-Correlation-Id");
  const correlationId = supplied && /^[A-Za-z0-9_.:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Correlation-Id": correlationId };
  const error = (status: number, code: string, message: string) =>
    Response.json({ error: { code, message } }, { status, headers });
  let response: Response | null = null;
  if (!isConfiguredSecret(process.env.HELPDESK_API_KEY)) {
    response = error(503, "HELPDESK_NOT_CONFIGURED", "Helpdesk API is not configured");
  } else {
    const auth = request.headers.get("Authorization");
    if (!secretsMatch(auth?.startsWith("Bearer ") ? auth.slice(7) : null, process.env.HELPDESK_API_KEY)) {
      response = error(401, "UNAUTHENTICATED", "A valid Helpdesk credential is required");
    }
  }
  return { headers, error, response };
}

export function helpdeskWorkOrder(item: { id: string; status: string; ticket_ref: string | null; updated_at: string }) {
  return { id: item.id, status: toHelpdeskStatus(item.status), ticketRef: item.ticket_ref, updatedAt: item.updated_at };
}
