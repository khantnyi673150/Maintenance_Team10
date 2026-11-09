import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { uuidSchema } from "@/lib/work-order-schemas";
import { authorizeHelpdesk, helpdeskWorkOrder } from "@/lib/helpdesk-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { headers, error, response } = authorizeHelpdesk(request);
  if (response) return response;
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
    return Response.json({ data: helpdeskWorkOrder(data) }, { headers });
  } catch {
    return error(503, "LOOKUP_UNAVAILABLE", "Work-order lookup is temporarily unavailable");
  }
}
