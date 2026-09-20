import { createRequestSupabaseClient } from "@/lib/supabase-server";
import { supabaseErrorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const supabase = createRequestSupabaseClient(request.headers.get("authorization"));
  const { data, error } = await supabase.rpc("close_work_order", {
    p_work_order_id: id,
  });

  if (error) return supabaseErrorResponse(error);
  return Response.json(data);
}
