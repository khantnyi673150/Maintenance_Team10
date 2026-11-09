"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, BadgeCheck, LoaderCircle, Search } from "lucide-react";

interface StudentIdentityTestProps {
  apiBase: string;
  accessToken: string;
}

interface ClaimsResult {
  data: unknown;
  upstreamStatus: number;
  checkedAt: string;
}

export default function StudentIdentityTest({ apiBase, accessToken }: StudentIdentityTestProps) {
  const [studentId, setStudentId] = useState("");
  const [result, setResult] = useState<ClaimsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function checkClaims(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subjectId = studentId.trim();
    if (!subjectId || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`${apiBase}/integrations/student-identity/claims`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ studentId: subjectId }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body !== null
          && "error" in body && typeof body.error === "object" && body.error !== null
          && "message" in body.error && typeof body.error.message === "string"
          ? body.error.message
          : `The request failed with HTTP ${response.status}`;
        throw new Error(message);
      }
      if (typeof body !== "object" || body === null || !("data" in body)
        || !("upstreamStatus" in body) || !("checkedAt" in body)
        || typeof body.upstreamStatus !== "number" || typeof body.checkedAt !== "string") {
        throw new Error("Student Identity returned an unexpected response");
      }
      setResult({
        data: body.data,
        upstreamStatus: body.upstreamStatus,
        checkedAt: body.checkedAt,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not check Student Identity");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="identity-test">
      <div className="identity-test-intro">
        <div className="identity-test-icon" aria-hidden="true"><BadgeCheck size={22} /></div>
        <div>
          <h2>Student Identity claims</h2>
          <p>Test the consented claims endpoint and inspect its response.</p>
        </div>
      </div>

      <div className="identity-test-notice" role="note">
        Use only your own ID or a test student who granted Maintenance <code>profile:read</code> consent.
        This test does not link the ID to a report submitter or verify who owns it.
        The response may contain personal information.
      </div>

      <form className="identity-test-form" onSubmit={checkClaims}>
        <div className="field">
          <label htmlFor="identity-student-id">Student ID</label>
          <p id="identity-student-id-help" className="field-help">The backend keeps the API key private and calls Student Identity on your behalf.</p>
          <input
            id="identity-student-id"
            aria-describedby="identity-student-id-help"
            autoComplete="off"
            required
            maxLength={100}
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
          />
        </div>
        <button className="send-button" type="submit" disabled={loading || !studentId.trim()}>
          {loading ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
          {loading ? "Checking…" : "Check claims"}
        </button>
      </form>

      {error && <div className="identity-test-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><p>{error}</p></div>}

      {result && (
        <section className="identity-test-result" aria-labelledby="identity-result-title">
          <div className="identity-test-result-heading">
            <h3 id="identity-result-title">Provider response</h3>
            <span>HTTP {result.upstreamStatus}</span>
          </div>
          <p className="field-help">Checked <time dateTime={result.checkedAt}>{new Date(result.checkedAt).toLocaleString()}</time></p>
          <pre aria-label="Student Identity claims response">{JSON.stringify(result.data, null, 2)}</pre>
        </section>
      )}
    </section>
  );
}
