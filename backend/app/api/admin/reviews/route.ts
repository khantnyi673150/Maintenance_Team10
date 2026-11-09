import { z } from "zod";
import { errorResponse, readJson, supabaseErrorResponse, timedJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

const reviewSchema = z.object({ category_id: z.string().uuid() });

export async function GET(request: Request) {
  const auth = await requireAuth(request, ["staff", "admin"]);
  if (auth.response) return auth.response;
  const started = performance.now();
  const { data, error } = await auth.context!.supabase
    .from("work_orders")
    .select("id,title,description,status,created_at,updated_at,category_id,location_id,location_text,classification_status,locations(building,floor_room),categories(name)")
    .eq("classification_status", "needs_review")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) return supabaseErrorResponse(error);
  return timedJson({ data: data ?? [] }, auth.context!, started);
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request, ["staff", "admin"]);
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) return errorResponse(400, "INVALID_ID", "A valid work-order id is required");
  const parsed = await readJson(request, reviewSchema);
  if (parsed.response) return parsed.response;
  const { data, error } = await auth.context!.supabase
    .from("work_orders")
    .update({ category_id: parsed.data!.category_id, classification_status: "classified" })
    .eq("id", id)
    .eq("classification_status", "needs_review")
    .select("*")
    .maybeSingle();
  if (error) return supabaseErrorResponse(error);
  if (!data) return errorResponse(404, "REVIEW_NOT_FOUND", "This review is no longer available");
  return timedJson({ data }, auth.context!, performance.now());
}
