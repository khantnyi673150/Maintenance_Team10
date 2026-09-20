"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

const sampleIds = {
  workOrder: "88888888-8888-4888-8888-888888888888",
  secondWorkOrder: "99999999-9999-4999-8999-999999999999",
  location: "11111111-1111-4111-8111-111111111111",
  category: "22222222-2222-4222-8222-222222222222",
};

const apiPresets = {
  create_work_order: {
    label: "Create work order",
    account: "reporter1@gmail.com",
    method: "POST",
    path: "/work-orders",
    body: JSON.stringify(
      {
        location_id: sampleIds.location,
        description: "Water is leaking beside the second-floor laboratory.",
        category_id: sampleIds.category,
        title: "Laboratory water leak",
      },
      null,
      2,
    ),
  },
  get_all_work_orders: {
    label: "Get all work orders",
    account: "reporter1@gmail.com",
    method: "GET",
    path: "/work-orders",
    body: "",
  },
  get_work_order_by_id: {
    label: "Get work order by id",
    account: "reporter1@gmail.com",
    method: "GET",
    path: `/work-orders/${sampleIds.workOrder}`,
    body: "",
  },
  update_work_order: {
    label: "Update work order",
    account: "staff1@gmail.com",
    method: "PATCH",
    path: `/work-orders/${sampleIds.workOrder}`,
    body: JSON.stringify(
      {
        title: "Laboratory water leak - updated",
        description: "Leak repaired temporarily while a permanent fix is scheduled.",
        location_id: sampleIds.location,
        category_id: sampleIds.category,
      },
      null,
      2,
    ),
  },
  delete_work_order: {
    label: "Delete work order",
    account: "staff1@gmail.com",
    method: "DELETE",
    path: `/work-orders/${sampleIds.secondWorkOrder}`,
    body: "",
  },
  assign_work_order: {
    label: "Assign work order",
    account: "staff1@gmail.com",
    method: "POST",
    path: `/work-orders/${sampleIds.workOrder}/assign`,
    body: JSON.stringify({ staff_id: "__CURRENT_USER_ID__" }, null, 2),
  },
  start_work_order: {
    label: "Start work order",
    account: "staff1@gmail.com",
    method: "POST",
    path: `/work-orders/${sampleIds.workOrder}/in-progress`,
    body: "",
  },
  resolve_work_order: {
    label: "Resolve work order",
    account: "staff1@gmail.com",
    method: "POST",
    path: `/work-orders/${sampleIds.workOrder}/resolve`,
    body: JSON.stringify({ resolution_notes: "Valve replaced and the pipe was sealed. Water flow has been restored." }, null, 2),
  },
  close_work_order: {
    label: "Close work order",
    account: "staff1@gmail.com",
    method: "POST",
    path: `/work-orders/${sampleIds.workOrder}/close`,
    body: "",
  },
  get_history: {
    label: "Get work order history",
    account: "reporter1@gmail.com",
    method: "GET",
    path: `/work-orders/${sampleIds.workOrder}/history`,
    body: "",
  },
} as const;

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

const accountPasswords: Record<string, string> = {
  "reporter1@gmail.com": "Reporter1",
  "staff1@gmail.com": "Staff1",
};

export default function ApiConsole() {
  const [selectedApi, setSelectedApi] = useState<keyof typeof apiPresets>("create_work_order");
  const [method, setMethod] = useState<HttpMethod>(apiPresets.create_work_order.method);
  const [path, setPath] = useState<string>(apiPresets.create_work_order.path);
  const [token, setToken] = useState("");
  const [account, setAccount] = useState<"reporter1@gmail.com" | "staff1@gmail.com">("reporter1@gmail.com");
  const [password, setPassword] = useState(accountPasswords["reporter1@gmail.com"]);
  const [showPassword, setShowPassword] = useState(false);
  const [signedInAs, setSignedInAs] = useState("");
  const [body, setBody] = useState(apiPresets.create_work_order.body);
  const [response, setResponse] = useState("Run a request to see the response here.");
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);

  function getCurrentUserIdFromToken(currentToken: string) {
    if (!currentToken) return "00000000-0000-4000-8000-000000000001";

    try {
      const payload = currentToken.split(".")[1];
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(atob(normalized));
      return decoded.sub ?? "00000000-0000-4000-8000-000000000001";
    } catch {
      return "00000000-0000-4000-8000-000000000001";
    }
  }

  useEffect(() => {
    const preset = apiPresets[selectedApi];
    const nextAccount = preset.account;
    const nextBody = preset.body?.includes("__CURRENT_USER_ID__")
      ? JSON.stringify({ staff_id: getCurrentUserIdFromToken(token) }, null, 2)
      : preset.body ?? "";

    setAccount(nextAccount);
    setMethod(preset.method);
    setPath(preset.path);
    setBody(nextBody);
    setPassword(accountPasswords[nextAccount] ?? "");
  }, [selectedApi, token]);

  async function signIn() {
    if (!password.trim()) {
      setStatus("Password required");
      setResponse("Enter the selected account password before signing in.");
      return;
    }

    setLoading(true);
    setStatus("Signing in...");
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: account,
        password,
      });

      if (error || !data.session) {
        setStatus("Sign-in failed");
        setResponse(error?.message ?? "No session was returned");
        return;
      }

      setToken(data.session.access_token);
      setSignedInAs(account);
      setPassword("");
      setStatus("Signed in");
      setResponse(`Signed in as ${account}. The access token is ready for API requests.`);
    } catch (error) {
      setStatus("Sign-in failed");
      setResponse(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendRequest() {
    setLoading(true);
    setStatus("Sending...");
    try {
      let parsedBody: unknown = undefined;
      if (!["GET", "DELETE"].includes(method)) {
        parsedBody = JSON.parse(body || "null");
      }

      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";
      const result = await fetch(`${apiBase}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(parsedBody ? { "Content-Type": "application/json" } : {}),
        },
        body: parsedBody ? JSON.stringify(parsedBody) : undefined,
      });
      const text = await result.text();
      let formatted = text;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep plain text */ }
      setStatus(`${result.status} ${result.statusText}`);
      setResponse(formatted || "(empty response)");
    } catch (error) {
      setStatus("Client error");
      setResponse(error instanceof Error ? error.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="console-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Maintenance / API Console</p>
          <h1>Test the work-order flow without guesswork.</h1>
          <p className="subtitle">A small operator console for exercising the backend contract, inspecting responses, and collecting Assignment #3 evidence.</p>
        </div>
        <span className="status-chip">{status}</span>
      </header>

      <section className="workspace">
        <div className="panel">
          <h2>Request</h2>
          <div className="field">
            <label htmlFor="api-select">API endpoint</label>
            <select id="api-select" value={selectedApi} onChange={(event) => setSelectedApi(event.target.value as keyof typeof apiPresets)}>
              {Object.entries(apiPresets).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="api-path">Endpoint path</label>
            <input id="api-path" value={path} onChange={(event) => setPath(event.target.value)} aria-label="API endpoint path" />
          </div>
          <div className="field">
            <label htmlFor="account">Test account</label>
            <select
              id="account"
              value={account}
              onChange={(event) => setAccount(event.target.value as "reporter1@gmail.com" | "staff1@gmail.com")}
            >
              <option value="reporter1@gmail.com">Reporter - reporter1@gmail.com</option>
              <option value="staff1@gmail.com">Staff - staff1@gmail.com</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="password">Account password</label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter the test account password"
                style={{ width: "100%", paddingRight: "42px" }}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <button className="secondary-button" type="button" onClick={signIn} disabled={loading}>
            {loading ? "Signing in..." : "Sign in to selected account"}
          </button>
          <div className="field token-field">
            <label htmlFor="token">Access token {signedInAs ? `(signed in as ${signedInAs})` : "(optional manual fallback)"}</label>
            <input id="token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Generated after sign-in" />
          </div>
          <div className="field">
            <label htmlFor="request-body">JSON body</label>
            <textarea id="request-body" value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} />
          </div>
          <button className="send-button" type="button" onClick={sendRequest} disabled={loading}>
            {loading ? "Sending request..." : "Send request"}
          </button>
          <p className="hint">Use the backend URL from NEXT_PUBLIC_API_BASE_URL. Tokens stay in this browser request and are never written to the repository.</p>
        </div>

        <div className="panel response-panel">
          <h2>Response</h2>
          <div className="response-meta"><span>HTTP result</span><strong>{status}</strong></div>
          <pre className="response-body">{response}</pre>
        </div>
      </section>
    </main>
  );
}
