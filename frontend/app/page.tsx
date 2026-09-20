"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

const defaultBody = JSON.stringify(
  {
    location_id: "11111111-1111-4111-8111-111111111111",
    description: "Water is leaking beside the second-floor laboratory.",
    category_id: "22222222-2222-4222-8222-222222222222",
    title: "Laboratory water leak",
  },
  null,
  2,
);

export default function ApiConsole() {
  const [method, setMethod] = useState("POST");
  const [path, setPath] = useState("/work-orders");
  const [token, setToken] = useState("");
  const [account, setAccount] = useState("reporter1@gmail.com");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState("");
  const [body, setBody] = useState(defaultBody);
  const [response, setResponse] = useState("Run a request to see the response here.");
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);

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
      if (!["GET", "DELETE"].includes(method)) parsedBody = JSON.parse(body);

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
            <label htmlFor="api-path">Endpoint path</label>
            <div className="row">
              <select id="api-method" value={method} onChange={(event) => setMethod(event.target.value)}>
                {['GET', 'POST', 'PATCH', 'DELETE'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <input id="api-path" value={path} onChange={(event) => setPath(event.target.value)} aria-label="API endpoint path" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="account">Test account</label>
            <select id="account" value={account} onChange={(event) => setAccount(event.target.value)}>
              <option value="reporter1@gmail.com">Reporter - reporter1@gmail.com</option>
              <option value="staff1@gmail.com">Staff - staff1@gmail.com</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="password">Account password</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter the test account password" />
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
          <p className="hint">Use the backend URL from `NEXT_PUBLIC_API_BASE_URL`. Tokens stay in this browser request and are never written to the repository.</p>
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
