import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const root = new URL("../", import.meta.url);
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "route-test-public-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "route-test-service-role-key";
process.env.STUDENT_IDENTITY_API_KEY = "route-test-identity-key";

const originalFetch = globalThis.fetch;
const identityRequests = [];
const reportRequests = [];
let identityStatus = 200;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.hostname === "student-identity.onrender.com") {
    identityRequests.push(url);
    if (identityStatus !== 200) return Response.json({ error: "private provider detail" }, { status: identityStatus });
    return Response.json({ claims: { student_verified: true, profile_complete: true } });
  }
  if (url.hostname === "supabase.invalid" && url.pathname === "/rest/v1/rpc/create_public_work_order") {
    const body = await request.json();
    reportRequests.push({ body, authorization: request.headers.get("authorization") });
    return Response.json({
      reference_number: `report-${reportRequests.length}`,
      student_identity_status: body.p_student_identity_status,
    });
  }
  throw new Error(`Unexpected request: ${url.hostname}${url.pathname}`);
};

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier.startsWith("@/")) return { url: new URL(`${specifier.slice(2)}.ts`, root).href, shortCircuit: true };
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !/\.[a-z]+$/i.test(specifier)) {
      return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
after(() => {
  globalThis.fetch = originalFetch;
  hooks.deregister();
});

const { POST } = await import(new URL("app/api/public/work-orders/route.ts", root));

function request(payload) {
  return new Request("http://localhost/api/public/work-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const validReport = {
  title: "Broken classroom light",
  description: "The ceiling light is not working in the classroom.",
  category: "Electrical",
  location: "C1, Room 204",
};

describe("Public report Student Identity check", () => {
  it("checks the optional ID and reports identified only when both claims are true", async () => {
    const response = await POST(request({ ...validReport, student_id: "student-fixture" }));
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result.student_identity.status, "identified");
    assert.equal(identityRequests.at(-1).pathname, "/students/student-fixture/claims");
    assert.equal(reportRequests.at(-1).body.p_student_identity_status, "identified");
    assert.equal(reportRequests.at(-1).body.student_id, undefined, "The student ID must not be stored in the work order");
    assert.equal(reportRequests.at(-1).authorization, "Bearer route-test-service-role-key");
  });

  it("saves the report and shows not identified when claims are denied", async () => {
    identityStatus = 403;
    try {
      const response = await POST(request({ ...validReport, student_id: "student-fixture" }));
      const result = await response.json();
      assert.equal(response.status, 201);
      assert.equal(result.student_identity.status, "not_identified");
      assert.match(result.student_identity.message, /consent/);
      assert.equal(reportRequests.length, 2);
      assert.equal(reportRequests.at(-1).body.p_student_identity_status, "not_identified");
    } finally {
      identityStatus = 200;
    }
  });

  it("saves reports without querying Student Identity when no ID is supplied", async () => {
    const before = identityRequests.length;
    const response = await POST(request(validReport));
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result.student_identity.status, "not_identified");
    assert.equal(identityRequests.length, before);
    assert.equal(reportRequests.at(-1).body.p_student_identity_status, "not_identified");
    assert.equal(reportRequests.at(-1).body.student_id, undefined);
  });
});
