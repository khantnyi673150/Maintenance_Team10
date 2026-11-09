import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type AppRole = "reporter" | "staff" | "admin";
export type MaintenanceCategory = "Plumbing" | "Electrical" | "HVAC" | "Safety";

export function resolveTrustedCategory(user: { app_metadata?: Record<string, unknown> }): MaintenanceCategory | null {
  if (user.app_metadata?.maintenance_all_categories === true) return null;
  if (Array.isArray(user.app_metadata?.maintenance_categories)) {
    return null;
  }

  const value = user.app_metadata?.maintenance_category ?? user.app_metadata?.category;
  return value === "Plumbing" || value === "Electrical" || value === "HVAC" || value === "Safety" ? value : null;
}

export function isTrustedCategorySelection(user: { app_metadata?: Record<string, unknown> }, value: string): value is MaintenanceCategory {
  if (value !== "Plumbing" && value !== "Electrical" && value !== "HVAC" && value !== "Safety") return false;
  const metadata = user.app_metadata;
  if (metadata?.role === "staff") return true;
  return metadata?.maintenance_all_categories === true
    || (Array.isArray(metadata?.maintenance_categories) && metadata.maintenance_categories.includes(value))
    || metadata?.maintenance_category === value
    || metadata?.category === value;
}

export function resolveTrustedRole(user: { app_metadata?: Record<string, unknown> }): AppRole | null {
  const role = user.app_metadata?.role;
  return role === "reporter" || role === "staff" || role === "admin" ? role : null;
}

export function isConfiguredSecret(value: string | undefined): value is string {
  return !!value && !/^(?:replace|optional|your[-_]|<)/i.test(value);
}

export function secretsMatch(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !isConfiguredSecret(expected)) return false;
  // Equal-sized digests avoid leaking the expected secret's length via comparison.
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export function verifyWebhookSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), "hex"),
    createHmac("sha256", secret).update(body, "utf8").digest(),
  );
}

export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 64) throw new Error("JSON nesting exceeds 64 levels");
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], depth + 1)}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
