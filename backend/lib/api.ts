import { z } from "zod";

export function errorResponse(
  status: number,
  code: string,
  message: string,
) {
  return Response.json({ error: { code, message } }, { status });
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data?: T; response?: Response }> {
  try {
    const body: unknown = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return {
        response: errorResponse(
          400,
          "VALIDATION_ERROR",
          result.error.issues.map((issue) => issue.message).join("; "),
        ),
      };
    }

    return { data: result.data };
  } catch {
    return {
      response: errorResponse(400, "INVALID_JSON", "Request body must be valid JSON"),
    };
  }
}

export function supabaseErrorResponse(error: { code?: string; message: string }) {
  const status = error.code === "PGRST116" ? 404 : 400;
  return errorResponse(status, error.code ?? "DATABASE_ERROR", error.message);
}
