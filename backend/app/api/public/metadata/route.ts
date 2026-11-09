import { errorResponse, supabaseErrorResponse } from "@/lib/api";
import { createPublicSupabaseClient } from "@/lib/supabase-public";

export async function GET() {
  try {
    const { data, error } = await createPublicSupabaseClient().rpc("get_public_work_order_metadata");
    if (error) return supabaseErrorResponse(error);
    return Response.json({ data });
  } catch {
    return errorResponse(503, "PUBLIC_DASHBOARD_UNAVAILABLE", "The public dashboard is temporarily unavailable");
  }
}
