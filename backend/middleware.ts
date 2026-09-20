import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const allowedMethods = "GET,POST,PATCH,DELETE,OPTIONS";
const allowedHeaders = "Authorization, Content-Type";

function allowedOrigin(request: NextRequest): string {
  const origin = request.headers.get("origin");
  const configured = (process.env.FRONTEND_ORIGINS ?? "http://localhost:3001")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return origin && configured.includes(origin) ? origin : configured[0];
}

export function middleware(request: NextRequest) {
  const origin = allowedOrigin(request);
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });

  if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });

  const response = NextResponse.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = { matcher: "/api/:path*" };
