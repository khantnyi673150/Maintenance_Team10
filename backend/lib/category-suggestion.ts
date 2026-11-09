import { errorResponse, readJson } from "@/lib/api";
import { classifyWithinDeadline } from "@/lib/ai-deadline";
import { classifyInputSchema, classifyIssueDescription } from "@/lib/ai-classifier";

export async function handleCategorySuggestion(request: Request) {
  const parsed = await readJson(request, classifyInputSchema);
  if (parsed.response) return parsed.response;

  const input = parsed.data!;
  try {
    const result = await classifyWithinDeadline((signal) => classifyIssueDescription(input, { signal }));
    return Response.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(500, "CLASSIFIER_ERROR", "Classification failed");
  }
}
