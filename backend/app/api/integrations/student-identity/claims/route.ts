import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { isConfiguredSecret } from "@/lib/security";

const requestSchema = z.object({
  studentId: z.string().trim().min(1).max(100),
}).strict();

const claimsUrl = "https://student-identity.onrender.com";

export async function POST(request: Request) {
  const auth = await requireAuth(request, ["staff", "admin"]);
  if (auth.response) return auth.response;

  const parsed = await readJson(request, requestSchema);
  if (parsed.response) return parsed.response;

  const apiKey = process.env.STUDENT_IDENTITY_API_KEY;
  if (!isConfiguredSecret(apiKey)) {
    return errorResponse(503, "IDENTITY_NOT_CONFIGURED", "Student Identity integration is not configured");
  }

  const url = new URL(
    `/students/${encodeURIComponent(parsed.data!.studentId)}/claims`,
    claimsUrl,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "X-API-Key": apiKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse(504, "IDENTITY_TIMEOUT", "Student Identity did not respond in time");
    }
    return errorResponse(502, "IDENTITY_UNAVAILABLE", "Student Identity could not be reached");
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 404) {
      return Response.json({ error: { code: "STUDENT_NOT_FOUND", message: "No claims were found for that student ID", upstreamStatus: status } }, { status: 404 });
    }
    if (status === 401 || status === 403) {
      return Response.json({ error: { code: "IDENTITY_ACCESS_DENIED", message: "Check that the API key is current and this student granted Maintenance profile:read consent", upstreamStatus: status } }, { status: 502 });
    }
    if (status === 429) {
      return Response.json({ error: { code: "IDENTITY_RATE_LIMITED", message: "Student Identity is temporarily rate limiting requests", upstreamStatus: status } }, { status: 503 });
    }
    return Response.json({ error: { code: "IDENTITY_PROVIDER_ERROR", message: "Student Identity returned an error", upstreamStatus: status } }, { status: 502 });
  }

  let data: unknown;
  try {
    const body = await response.text();
    if (body.length > 64 * 1024) {
      return errorResponse(502, "IDENTITY_RESPONSE_TOO_LARGE", "Student Identity returned an oversized response");
    }
    data = JSON.parse(body);
  } catch {
    return errorResponse(502, "IDENTITY_INVALID_RESPONSE", "Student Identity returned invalid JSON");
  }

  return Response.json({
    data,
    upstreamStatus: response.status,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
