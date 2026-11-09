import test from "node:test";
import assert from "node:assert/strict";
import { requestCategorySuggestion, CategoryRequestTimeout } from "../lib/category-request.ts";

test("public suggestions send only the issue text without an authorization header", async () => {
  const input = { title: "Light", description: "The light is flickering." };
  await requestCategorySuggestion("https://fixture.invalid/api/public/categorize", null, { ...input, student_id: "omit-me", ticketRef: "omit-me" }, {
    transport: async (_url, options) => {
      assert.equal(new Headers(options.headers).has("authorization"), false);
      assert.deepEqual(JSON.parse(options.body), input);
      return Response.json({ data: { fallbackToManual: true } });
    },
  });
});

test("the browser deadline aborts a slow suggestion even if transport ignores abort", async () => {
  let signal;
  await assert.rejects(requestCategorySuggestion("https://fixture.invalid/api/ai/categorize", "fixture-token", { title: "Light", description: "Flickering" }, { timeoutMs: 10, transport: async (_url, options) => { signal = options.signal; return new Promise(() => {}); } }), CategoryRequestTimeout);
  assert.equal(signal.aborted, true);
});
test("the deadline includes slow response-body parsing", async () => {
  await assert.rejects(requestCategorySuggestion("https://fixture.invalid/api/ai/categorize", "fixture-token", { title: "Light", description: "Flickering" }, { timeoutMs: 10, transport: async () => ({ ok: true, json: () => new Promise(() => {}) }) }), CategoryRequestTimeout);
});
test("fast suggestions preserve their result and rejected responses fail safely", async () => {
  const data = { fallbackToManual: false, category_id: "electrical", category_name: "Electrical" };
  const result = await requestCategorySuggestion("https://fixture.invalid/api/ai/categorize", "fixture-token", { title: "Light", description: "Flickering" }, { transport: async () => Response.json({ data }) });
  assert.deepEqual(result.data, data);
  await assert.rejects(requestCategorySuggestion("https://fixture.invalid/api/ai/categorize", "fixture-token", { title: "Light", description: "Flickering" }, { transport: async () => Response.json({}, { status: 503 }) }));
});
