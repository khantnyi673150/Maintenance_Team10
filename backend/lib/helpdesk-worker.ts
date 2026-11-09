import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { drainHelpdeskQueue } from "./helpdesk-delivery.ts";

export async function runHelpdeskWorker(target: string, secret: string) {
  const db = createSupabaseAdminClient();
  return drainHelpdeskQueue({
    async claim() {
      const { data, error } = await db.rpc("claim_helpdesk_event");
      if (error) throw new Error("Helpdesk queue claim failed");
      return data?.[0] ?? null;
    },
    async finish(event, status) {
      const { error } = await db.rpc("finish_helpdesk_event", {
        p_event_id: event.event_id, p_lease_token: event.lease_token, p_http_status: status,
      });
      if (error) throw new Error("Helpdesk delivery acknowledgement failed");
    },
  }, target, secret);
}
