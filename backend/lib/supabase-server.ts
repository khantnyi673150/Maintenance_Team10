import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";

export function createRequestSupabaseClient(
  authorization: string | null,
): SupabaseClient {
  const { url, anonKey } = supabaseEnv();

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: authorization
      ? { headers: { Authorization: authorization } }
      : undefined,
  });
}
