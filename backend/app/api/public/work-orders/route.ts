import { errorResponse, readJson, supabaseErrorResponse } from "@/lib/api";
import { createPublicSupabaseClient } from "@/lib/supabase-public";
import {
  createPublicWorkOrderSchema,
  publicWorkOrderQuerySchema,
  type CreatePublicWorkOrderInput,
} from "@/lib/work-order-schemas";

export async function GET(request: Request) {
  const parsed = publicWorkOrderQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return errorResponse(400, "INVALID_FILTER", "Public ticket filters are invalid");

  try {
    const { data, error } = await createPublicSupabaseClient().rpc("list_public_work_orders", {
      p_status: parsed.data.status ?? null,
      p_limit: parsed.data.limit,
      p_offset: parsed.data.offset,
    });
    if (error) return supabaseErrorResponse(error);
    return Response.json({ data: Array.isArray(data) ? data : [] });
  } catch (error) {
    console.error("Public work-order creation failed", error);
    return errorResponse(503, "PUBLIC_DASHBOARD_UNAVAILABLE", "The public dashboard is temporarily unavailable");
  }
}

export async function POST(request: Request) {
  const parsed = await readJson<CreatePublicWorkOrderInput>(request, createPublicWorkOrderSchema);
  if (parsed.response) return parsed.response;

  try {
    const { data, error } = await createPublicSupabaseClient().rpc("create_public_work_order", {
      p_title: parsed.data!.title,
      p_description: parsed.data!.description,
      p_category_name: parsed.data!.category,
      p_location: parsed.data!.location,
    });
    if (error) return supabaseErrorResponse(error);
    return Response.json({ success: true, data }, { status: 201 });
  } catch {
    return errorResponse(503, "PUBLIC_DASHBOARD_UNAVAILABLE", "The public dashboard is temporarily unavailable");
  }
}
