import { createRequestSupabaseClient } from "@/lib/supabase-server";
import { readJson, supabaseErrorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import {
  assignWorkOrderSchema,
  type AssignWorkOrderInput,
} from "@/lib/work-order-schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;

  const parsed = await readJson<AssignWorkOrderInput>(request, assignWorkOrderSchema);
  if (parsed.response) return parsed.response;

  const { id } = await context.params;
  const supabase = createRequestSupabaseClient(request.headers.get("authorization"));
  const { data, error } = await supabase.rpc("assign_work_order", {
    p_work_order_id: id,
    p_staff_id: parsed.data!.staff_id,
  });

  if (error) return supabaseErrorResponse(error);
  return Response.json(data);
}
