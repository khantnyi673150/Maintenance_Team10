import { requireAuth } from "@/lib/auth";
import { fetchTeam12ActivitiesWithRetry } from "@/lib/team12-integration";

export async function GET(request: Request) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;

  const result = await fetchTeam12ActivitiesWithRetry();
  return Response.json(result, {
    headers: result.status === "degraded" ? { "Retry-After": "30" } : undefined,
  });
}