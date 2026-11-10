import type { AuthError, User } from "@supabase/supabase-js";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { maintenanceCategoryNames, resolveTrustedCategory, resolveTrustedRole } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { uuidSchema } from "@/lib/work-order-schemas";

const category = z.enum(maintenanceCategoryNames);
const createStaff = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  category,
}).strict();
const updateStaff = z.object({ id: uuidSchema, category }).strict();

function staffRecord(user: User) {
  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
    category: resolveTrustedCategory(user),
  };
}

function staffResponse(data: unknown, status = 200) {
  return Response.json({ data }, { status, headers: { "Cache-Control": "private, no-store" } });
}

function staffError(error?: AuthError) {
  if (error?.code === "email_exists" || error?.code === "user_already_exists") {
    return errorResponse(409, "ACCOUNT_EXISTS", "This email already has an account. Edit its category if it is a staff account.");
  }
  return errorResponse(503, "STAFF_ACCOUNTS_UNAVAILABLE", "Staff accounts are temporarily unavailable");
}

export async function GET(request: Request) {
  const auth = await requireAuth(request, ["admin"]);
  if (auth.response) return auth.response;
  try {
    const admin = createSupabaseAdminClient().auth.admin;
    const staff: ReturnType<typeof staffRecord>[] = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const result = await admin.listUsers({ page, perPage });
      if (result.error) return staffError(result.error);
      staff.push(...result.data.users.filter((user) => resolveTrustedRole(user) === "staff").map(staffRecord));
      if (result.data.users.length < perPage) break;
    }
    return staffResponse(staff);
  } catch {
    return staffError();
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = await readJson(request, createStaff);
  if (parsed.response) return parsed.response;
  const { email, name, category } = parsed.data!;
  try {
    // The administrator verifies the address. Staff prove mailbox access
    // when they set their first password through the recovery email.
    const { data, error } = await createSupabaseAdminClient().auth.admin.createUser({
      email: email.toLowerCase(),
      email_confirm: true,
      app_metadata: { role: "staff", maintenance_category: category },
      user_metadata: { full_name: name },
    });
    if (error || !data.user) return staffError(error ?? undefined);
    return staffResponse(staffRecord(data.user), 201);
  } catch {
    return staffError();
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(request, ["admin"]);
  if (auth.response) return auth.response;
  const parsed = await readJson(request, updateStaff);
  if (parsed.response) return parsed.response;
  const { id, category } = parsed.data!;
  try {
    const admin = createSupabaseAdminClient().auth.admin;
    const existing = await admin.getUserById(id);
    if (existing.error && existing.error.status !== 404) return staffError(existing.error);
    if (!existing.data.user || resolveTrustedRole(existing.data.user) !== "staff") {
      return errorResponse(404, "STAFF_NOT_FOUND", "Staff account not found");
    }
    const { data, error } = await admin.updateUserById(id, {
      app_metadata: { maintenance_category: category },
    });
    if (error || !data.user) return staffError(error ?? undefined);
    return staffResponse(staffRecord(data.user));
  } catch {
    return staffError();
  }
}
