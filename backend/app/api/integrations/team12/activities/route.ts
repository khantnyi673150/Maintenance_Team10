import { errorResponse } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { fetchTeam12Activities } from "@/lib/team12-integration";

export async function GET(request: Request) {
  const auth = await requireAuth(request, ["staff"]);
  if (auth.response) return auth.response;

  try {
    const data = await fetchTeam12Activities();
    return Response.json({ data });
  } catch (error) {
    return errorResponse(
      502,
      "TEAM12_UNAVAILABLE",
      error instanceof Error ? error.message : "Team 12 is unavailable",
    );
  }
}