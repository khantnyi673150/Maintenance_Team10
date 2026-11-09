import { handleCategorySuggestion } from "@/lib/category-suggestion";

export async function POST(request: Request) {
  return handleCategorySuggestion(request);
}
