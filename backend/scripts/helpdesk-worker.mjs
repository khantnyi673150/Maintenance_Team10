// Run on an always-on host, or call the protected delivery URL from your scheduler.
import { setTimeout } from "node:timers/promises";

const target = process.env.HELPDESK_WORKER_URL;
const secret = process.env.HELPDESK_WORKER_SECRET;
if (!target || !secret || /^(replace|optional|your[-_]|<)/i.test(secret)) {
  throw new Error("Set HELPDESK_WORKER_URL and HELPDESK_WORKER_SECRET before starting the worker");
}
const url = new URL(target);
if (url.username || url.password || (url.protocol !== "https:" &&
  !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
  throw new Error("Worker URL must use HTTPS (localhost HTTP is allowed in development)");
}
const once = process.argv.includes("--once");
do {
  if (process.env.HELPDESK_DELIVERY_ENABLED === "false") {
    console.info("Helpdesk delivery paused", { at: new Date().toISOString() });
  } else try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` },
      redirect: "error", signal: AbortSignal.timeout(55_000) });
    if (!response.ok) throw new Error(`Worker endpoint returned HTTP ${response.status}`);
    const result = await response.json();
    console.info("Helpdesk delivery run", { at: new Date().toISOString(), processed: result.processed, delivered: result.delivered });
  } catch {
    console.error("Helpdesk worker run failed; queued deliveries are retained", { at: new Date().toISOString() });
    if (once) process.exitCode = 1;
  }
  if (!once) await setTimeout(60_000);
} while (!once);
