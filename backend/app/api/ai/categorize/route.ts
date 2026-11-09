import { requireAuth } from "@/lib/auth";
import { handleCategorySuggestion } from "@/lib/category-suggestion";

export async function POST(request: Request) {
  // Enforce authentication so only registered students/staff can invoke classification
  const auth = await requireAuth(request, ["reporter", "staff"]);
  if (auth.response) return auth.response;

  return handleCategorySuggestion(request);
}
