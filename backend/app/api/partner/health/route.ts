import { errorResponse } from "@/lib/api";

export function GET(request: Request) {
  const expected = process.env.TEAM10_PARTNER_KEY;
  if (!expected || request.headers.get("x-partner-key") !== expected) {
    return errorResponse(401, "INVALID_PARTNER_KEY", "Partner key is invalid");
  }

  if (process.env.TEAM10_PARTNER_HEALTH_DEGRADED === "true") {
    return errorResponse(503, "PARTNER_UNAVAILABLE", "Maintenance partner health check is temporarily unavailable");
  }

  return Response.json({ status: "ok", service: "maintenance-team10-api" });
}