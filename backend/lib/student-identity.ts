import { isConfiguredSecret } from "./security.ts";

export type StudentIdentityCheck = {
  identified: boolean;
  message: string;
};

const studentVerificationKeys = new Set([
  "verified",
  "studentverified",
  "verifiedstudent",
  "isstudent",
  "isverifiedstudent",
]);
const profileCompletionKeys = new Set([
  "profilecomplete",
  "isprofilecomplete",
]);

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[-_\s]/g, "");
}

function claimValues(value: unknown, keys: Set<string>, found: boolean[] = [], depth = 0): boolean[] {
  if (depth > 20 || value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) claimValues(item, keys, found, depth + 1);
    return found;
  }

  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (keys.has(normalizedKey(key)) && typeof child === "boolean") found.push(child);
    if ((key === "name" || key === "key" || key === "claim") && typeof child === "string"
      && keys.has(normalizedKey(child)) && typeof record.value === "boolean") {
      found.push(record.value);
    }
    claimValues(child, keys, found, depth + 1);
  }
  return found;
}

export function assessStudentIdentityClaims(claims: unknown): StudentIdentityCheck {
  const verification = claimValues(claims, studentVerificationKeys);
  const profileCompletion = claimValues(claims, profileCompletionKeys);

  if (verification.length && verification.every(Boolean)
    && profileCompletion.length && profileCompletion.every(Boolean)) {
    return { identified: true, message: "The Identity service confirmed student verification and a complete profile for this ID." };
  }
  if (!verification.length || !profileCompletion.length) {
    return { identified: false, message: "The Identity response did not confirm both student verification and profile completeness." };
  }
  if (verification.some((value) => !value)) {
    return { identified: false, message: "The Identity service did not verify this student ID." };
  }
  return { identified: false, message: "The Identity service reports an incomplete profile for this student ID." };
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function checkStudentIdentity(studentId: string, apiKey: string | undefined): Promise<StudentIdentityCheck> {
  if (!isConfiguredSecret(apiKey)) {
    return { identified: false, message: "Student Identity is not configured; the report was still saved." };
  }

  const claimsUrl = new URL(
    `/students/${encodeURIComponent(studentId)}/claims`,
    "https://student-identity.onrender.com",
  );
  let response: Response;
  try {
    response = await fetch(claimsUrl, {
      headers: { Accept: "application/json", "X-API-Key": apiKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    return { identified: false, message: "Student Identity could not be reached; the report was still saved." };
  }

  if (response.status === 404) {
    return { identified: false, message: "This student ID was not found; the report was still saved." };
  }
  if (response.status === 401 || response.status === 403) {
    return { identified: false, message: "Claims are unavailable. Check that the student granted Maintenance profile:read consent; the report was still saved." };
  }
  if (!response.ok) {
    return { identified: false, message: "Student Identity is unavailable; the report was still saved." };
  }

  let text: string | null;
  try {
    text = await readBoundedBody(response, 64 * 1024);
  } catch {
    return { identified: false, message: "Student Identity returned invalid claims; the report was still saved." };
  }
  if (text === null) {
    return { identified: false, message: "Student Identity returned an oversized response; the report was still saved." };
  }
  try {
    return assessStudentIdentityClaims(JSON.parse(text));
  } catch {
    return { identified: false, message: "Student Identity returned invalid claims; the report was still saved." };
  }
}
