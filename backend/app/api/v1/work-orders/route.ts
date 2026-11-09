import { readJson } from "@/lib/api";
import { authorizeHelpdesk, helpdeskWorkOrder } from "@/lib/helpdesk-api";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createHelpdeskWorkOrderSchema } from "@/lib/work-order-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = authorizeHelpdesk(request);
  if (access.response) return access.response;
  const parsed = await readJson(request, createHelpdeskWorkOrderSchema);
  if (parsed.response) {
    for (const [name, value] of Object.entries(access.headers)) parsed.response.headers.set(name, value);
    return parsed.response;
  }
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("create_helpdesk_work_order", {
      p_ticket_ref: parsed.data!.ticketRef,
      p_title: parsed.data!.title,
      p_description: parsed.data!.description,
      p_location: parsed.data!.location ?? null,
      ...(parsed.data!.category !== undefined ? { p_category: parsed.data!.category } : {}),
    }).abortSignal(AbortSignal.timeout(2500));
    if (error) {
      if (["22023", "23514", "22P02"].includes(error.code)) {
        return access.error(400, "INVALID_REQUEST", "Check the ticket reference, title, description, location and category");
      }
      return access.error(503, "CREATION_UNAVAILABLE", "Work-order creation is temporarily unavailable; retry with the same ticketRef");
    }
    if (!data?.work_order || typeof data.duplicate !== "boolean") throw new Error("Unexpected creation result");
    return Response.json({ data: helpdeskWorkOrder(data.work_order) }, {
      status: data.duplicate ? 200 : 201, headers: access.headers,
    });
  } catch {
    return access.error(503, "CREATION_UNAVAILABLE", "Work-order creation is temporarily unavailable; retry with the same ticketRef");
  }
}
