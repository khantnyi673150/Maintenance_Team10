import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isConfiguredSecret, secretsMatch } from "@/lib/security";
import { uuidSchema } from "@/lib/work-order-schemas";
import { toHelpdeskStatus } from "@/lib/helpdesk-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const supplied = request.headers.get("X-Correlation-Id");
  const correlationId = supplied && /^[A-Za-z0-9_.:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Correlation-Id": correlationId };
  const error = (status: number, code: string, message: string) =>
    Response.json({ error: { code, message } }, { status, headers });
  if (!isConfiguredSecret(process.env.HELPDESK_API_KEY)) {
    return error(503, "HELPDESK_NOT_CONFIGURED", "Helpdesk lookup is not configured");
  }
  const auth = request.headers.get("Authorization");
  if (!secretsMatch(auth?.startsWith("Bearer ") ? auth.slice(7) : null, process.env.HELPDESK_API_KEY)) {
    return error(401, "UNAUTHENTICATED", "A valid Helpdesk credential is required");
  }
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return error(400, "INVALID_ID", "A work-order UUID is required");
  try {
    const { data, error: dbError } = await createSupabaseAdminClient()
      .from("work_orders")
      .select("id,status,ticket_ref,updated_at")
      .eq("id", id).is("archived_at", null).not("ticket_ref", "is", null)
      .abortSignal(AbortSignal.timeout(2500)).maybeSingle();
    if (dbError) return error(503, "LOOKUP_UNAVAILABLE", "Work-order lookup is temporarily unavailable");
    if (!data) return error(404, "NOT_FOUND", "Helpdesk work order not found");
    return Response.json({ data: {
      id: data.id, status: toHelpdeskStatus(data.status), ticketRef: data.ticket_ref, updatedAt: data.updated_at,
    } }, { headers });
  } catch {
    return error(503, "LOOKUP_UNAVAILABLE", "Work-order lookup is temporarily unavailable");
  }
}
