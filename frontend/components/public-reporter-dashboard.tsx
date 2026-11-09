"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, LoaderCircle, MapPin, Plus, RefreshCw, Search, Sparkles } from "lucide-react";
import AccessibleDialog from "@/components/accessible-dialog";
import { CampusHeader } from "@/components/campus-brand";
import LocationHint from "@/components/location-hint";
import { requestCategorySuggestion } from "@/lib/category-request";
import { reviewCategorySuggestion } from "@/lib/category-review";
import { maintenanceCategories } from "@/lib/maintenance-role";

const categoryOptions = maintenanceCategories.map(({ value }) => ({ id: value, name: value }));
const notSure = { id: "Unknown", name: "Not sure" };
const suggestionDescriptionLimit = 2000;
const statuses = {
  STARTED: { label: "Submitted", badge: "OPEN" },
  IN_PROGRESS: { label: "In progress", badge: "IN_PROGRESS" },
  FINISHED: { label: "Finished", badge: "CLOSED" },
} as const;

type PublicTicket = {
  reference_number: string;
  title: string;
  description: string;
  status: keyof typeof statuses;
  student_identity_status?: "identified" | "not_identified" | "not_checked";
  updated_at: string;
  category: { name: string };
  location: { building: string | null; floor_room: string | null };
};

type PublicSuggestion =
  | { status: "loading" | "unavailable" }
  | { status: "ready"; category: string | undefined; buildingHint: string | null };

const emptyForm = { title: "", description: "", category: "", location: "", student_id: "", ticketRef: "" };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

export default function PublicReporterDashboard() {
  const [view, setView] = useState<"report" | "track">("report");
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [filter, setFilter] = useState<"ALL" | keyof typeof statuses>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);
  const [submittedIdentity, setSubmittedIdentity] = useState<{ status: "identified" | "not_identified"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [suggestion, setSuggestion] = useState<PublicSuggestion | null>(null);
  const [detailReference, setDetailReference] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const suggestionRequest = useRef<symbol | null>(null);
  const locationField = useRef<HTMLInputElement>(null);

  const loadTickets = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(apiBase + "/public/work-orders?limit=100", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Couldn’t load requests.");
      const result = await response.json();
      if (!Array.isArray(result.data)) throw new Error("Couldn’t load requests.");
      if (!controller.signal.aborted) setTickets(result.data);
    } catch {
      if (!controller.signal.aborted) setError("Couldn’t load requests. Try refreshing.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "track") return;
    void loadTickets();
    const timer = window.setInterval(() => void loadTickets(), 30000);
    return () => {
      window.clearInterval(timer);
      request.current?.abort();
    };
  }, [view, loadTickets]);

  const query = search.trim().toLowerCase();
  const visibleTickets = tickets.filter((ticket) => {
    const matchesStatus = filter === "ALL" || ticket.status === filter;
    const matchesSearch = !query || [ticket.reference_number, ticket.title, ticket.description, ticket.category.name, ticket.location.building, ticket.location.floor_room]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });
  const detail = tickets.find((ticket) => ticket.reference_number === detailReference);
  const description = form.description.trim();
  const exceedsSuggestionLimit = description.length > suggestionDescriptionLimit;
  const suggestedCategory = suggestion?.status === "ready" ? suggestion.category : undefined;
  const suggestedName = suggestedCategory === notSure.id ? notSure.name : suggestedCategory;
  const buildingHint = suggestion?.status === "ready" ? suggestion.buildingHint : null;

  function updateIssueText(field: "title" | "description", value: string) {
    suggestionRequest.current = null;
    setSuggestion(null);
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function suggestCategory() {
    if (!description || exceedsSuggestionLimit || submittingRef.current || suggestionRequest.current) return;
    const requestId = Symbol();
    suggestionRequest.current = requestId;
    setSuggestion({ status: "loading" });
    try {
      const { data } = await requestCategorySuggestion(apiBase + "/public/categorize", null, { title: form.title, description });
      if (suggestionRequest.current !== requestId) return;
      const result = reviewCategorySuggestion({ categoryId: form.category, locationId: form.location }, data, categoryOptions);
      setSuggestion({
        status: "ready",
        category: result.needsManualReview ? notSure.id : result.categoryName,
        buildingHint: result.buildingHint,
      });
    } catch {
      if (suggestionRequest.current === requestId) setSuggestion({ status: "unavailable" });
    } finally {
      if (suggestionRequest.current === requestId) suggestionRequest.current = null;
    }
  }

  function trackSubmission(reference: string) {
    setSearch(reference);
    setFilter("ALL");
    setView("track");
  }

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setSubmittedReference(null);
    setSubmittedIdentity(null);
    try {
      const response = await fetch(apiBase + "/public/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          student_id: form.student_id.trim() || undefined,
          ticketRef: form.ticketRef.trim() || undefined,
          category: form.category === notSure.id ? null : form.category,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Couldn’t send your request.");
      if (typeof result.data?.reference_number !== "string" || !result.data.reference_number) {
        throw new Error("Couldn’t confirm the request. Check the tracker before sending again.");
      }
      setSubmittedReference(result.data.reference_number);
      setSubmittedIdentity({
        status: result.student_identity?.status === "identified" ? "identified" : "not_identified",
        message: typeof result.student_identity?.message === "string"
          ? result.student_identity.message
          : "Student identity was not confirmed; the report was still saved.",
      });
      suggestionRequest.current = null;
      setSuggestion(null);
      setForm(emptyForm);
    } catch (failure) {
      setSubmitError(failure instanceof Error ? failure.message : "Couldn’t send your request.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <div className="public-dashboard">
    <CampusHeader action={<Link className="btn-switch-role" href="/login">Staff sign in<ArrowRight size={16} aria-hidden="true" /></Link>} />
    <main className="public-main">
      <div className="public-page-heading">
        <h1>Maintenance requests</h1>
        <p>Report a campus issue or check a repair.</p>
      </div>
      <nav className="public-navigation" aria-label="Public maintenance">
        <button type="button" aria-current={view === "report" ? "page" : undefined} onClick={() => setView("report")}><Plus size={18} aria-hidden="true" />Report an issue</button>
        <button type="button" aria-current={view === "track" ? "page" : undefined} onClick={() => setView("track")}><ClipboardList size={18} aria-hidden="true" />Track requests</button>
      </nav>

      {view === "report" ? <section className="public-card" aria-labelledby="report-heading">
        <h2 id="report-heading">Report an issue</h2>
        {submittedReference && <div className="public-confirmation" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div><strong>Request sent</strong><p>Reference {submittedReference}</p></div>
          <button type="button" className="overview-link" onClick={() => trackSubmission(submittedReference)}>Track request<ArrowRight size={16} aria-hidden="true" /></button>
          {submittedIdentity && <div className={`public-identity-result ${submittedIdentity.status}`}>
            <strong>{submittedIdentity.status === "identified" ? "Student ID claims verified" : "Student ID claims not verified"}</strong>
          </div>}
        </div>}
        <form onSubmit={submitTicket} aria-busy={submitting}>
          <fieldset className="public-fields" disabled={submitting}>
            <legend className="sr-only">Issue details</legend>
            <div className="field"><label htmlFor="public-title">Issue title</label><input id="public-title" required maxLength={200} value={form.title} onChange={(event) => updateIssueText("title", event.target.value)} placeholder="e.g. Broken light in Room 204" /></div>
            <div className="field">
              <label htmlFor="public-description">Description</label>
              <textarea id="public-description" aria-describedby="public-privacy" required maxLength={10000} value={form.description} onChange={(event) => updateIssueText("description", event.target.value)} placeholder="What happened?" />
              <p id="public-privacy" className="field-help">This report is public. Leave out personal information.</p>
              <div className="public-category-suggestion">
                <button type="button" className="btn-switch-role" aria-describedby="public-category-suggestion-status"
                  onClick={() => void suggestCategory()} disabled={!description || exceedsSuggestionLimit || suggestion?.status === "loading"}>
                  {suggestion?.status === "loading" ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
                  {suggestion?.status === "loading" ? "Finding a category…" : "Suggest a category"}
                </button>
                {suggestedName && <div className="public-category-result">
                  <div>
                    <strong>Suggested category · {suggestedName}</strong>
                    {suggestedCategory === notSure.id && <p className="field-help">Not sure sends this request to Manual Review.</p>}
                  </div>
                  {suggestedCategory && form.category !== suggestedCategory && <button type="button" className="btn-switch-role" onClick={() => {
                    setForm((current) => ({ ...current, category: suggestedCategory }));
                    locationField.current?.focus();
                  }}>Use {suggestedName}</button>}
                </div>}
                <p id="public-category-suggestion-status" className={suggestedName ? "sr-only" : "field-help"} role="status">
                  {suggestedName ? `${suggestedName} suggested.`
                    : exceedsSuggestionLimit ? "Suggestions are available for descriptions up to 2,000 characters. Choose a category to continue."
                      : suggestion?.status === "unavailable" ? "Suggestions are unavailable. Choose a category or select Not sure."
                        : suggestion?.status === "ready" ? "No clear suggestion. Choose a category or select Not sure." : ""}
                </p>
              </div>
            </div>
            <div className="report-select-grid">
              <div className="field">
                <label htmlFor="public-location">Location</label>
                <input id="public-location" ref={locationField} aria-describedby="report-location-hint" required maxLength={300} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="e.g. C1, Room 204" />
                <LocationHint building={buildingHint} />
              </div>
              <div className="field">
                <label htmlFor="public-category">Category</label>
                <select id="public-category" required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  <option value="">Choose a category</option>
                  {categoryOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                  <option value={notSure.id}>{notSure.name}</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="public-student-id">Student ID <span className="public-optional">(optional)</span></label>
              <input id="public-student-id" maxLength={100} autoComplete="off" value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })} placeholder="Enter your student ID to check" />
              <p className="field-help">We check the ID's consented claims for student verification and profile completeness. The result is shown on the public request card; the ID and claims are not saved. This verifies the entered ID's claims, not who submitted the report. Do not enter another person's ID.</p>
            </div>
            <div className="field">
              <label htmlFor="public-ticket-ref">Helpdesk ticket reference <span className="public-optional">(optional)</span></label>
              <input id="public-ticket-ref" maxLength={62} pattern="TKT-[0-9]{1,58}" autoComplete="off" aria-describedby="public-ticket-ref-help" value={form.ticketRef} onChange={(event) => setForm({ ...form, ticketRef: event.target.value })} placeholder="e.g. TKT-00012" />
              <p id="public-ticket-ref-help" className="field-help">If Helpdesk sent you here, enter the ticket reference they provided.</p>
            </div>
            {submitError && <p className="request-action-error" role="alert">{submitError}</p>}
            <button type="submit" className="send-button">{submitting && <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{submitting ? "Sending…" : "Send request"}</button>
          </fieldset>
        </form>
      </section> : <section className="public-card" aria-labelledby="tracker-heading" aria-busy={loading}>
        <h2 id="tracker-heading">Track requests</h2>
        <div className="public-toolbar">
          <label className="public-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search requests</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by reference, title or location" /></label>
          <select aria-label="Request status" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="ALL">All statuses</option>{Object.entries(statuses).map(([key, status]) => <option key={key} value={key}>{status.label}</option>)}</select>
          <button type="button" className="btn-switch-role public-refresh" onClick={() => void loadTickets()} disabled={loading} aria-label="Refresh requests"><RefreshCw size={18} aria-hidden="true" /></button>
        </div>
        {error && <p className="request-action-error" role="alert">{error}</p>}
        {loading && !tickets.length && <p className="overview-empty" role="status">Loading requests…</p>}
        {!loading && !error && !visibleTickets.length && <div className="overview-empty public-empty">
          <p>{query || filter !== "ALL" ? "No matching requests." : "No requests yet."}</p>
          {(query || filter !== "ALL") && <button type="button" className="text-button" onClick={() => { setSearch(""); setFilter("ALL"); }}>Clear filters</button>}
        </div>}
        <div className="request-list">
          {visibleTickets.map((ticket) => <article className="request-row public-ticket" key={ticket.reference_number}>
            <div className="compact-request-header">
              <div><h3>{ticket.title}</h3><p className="request-row-meta"><span><MapPin size={15} aria-hidden="true" />{[ticket.location.building, ticket.location.floor_room].filter(Boolean).join(" · ") || "Location unavailable"}</span></p></div>
              <span className={"overview-badge " + statuses[ticket.status].badge}>{statuses[ticket.status].label}</span>
            </div>
            <div className="public-ticket-footer">
              <span className="public-ticket-meta">{ticket.category.name} · {ticket.reference_number}
                <span className={`public-identity-badge ${ticket.student_identity_status ?? "not_checked"}`}>
                  {ticket.student_identity_status === "identified" ? "Student ID claims verified"
                    : ticket.student_identity_status === "not_identified" ? "Student ID claims not verified"
                      : "Student ID not checked"}
                </span>
              </span>
              <button type="button" className="overview-link" onClick={() => setDetailReference(ticket.reference_number)}>Details<ArrowRight size={16} aria-hidden="true" /><span className="sr-only"> for {ticket.title}</span></button>
            </div>
          </article>)}
        </div>
      </section>}

      {detail && <AccessibleDialog id="public-ticket-details" title="Request details" onClose={() => setDetailReference(null)}>
        <h3 className="request-detail-title">{detail.title}</h3>
        <p className="dialog-description">{detail.description}</p>
        <dl className="public-detail-list">
          <div><dt>Reference</dt><dd>{detail.reference_number}</dd></div>
          <div><dt>Status</dt><dd>{statuses[detail.status].label}</dd></div>
          <div><dt>Location</dt><dd>{[detail.location.building, detail.location.floor_room].filter(Boolean).join(" · ") || "Location unavailable"}</dd></div>
          <div><dt>Category</dt><dd>{detail.category.name}</dd></div>
          <div><dt>Student ID claims</dt><dd>{detail.student_identity_status === "identified" ? "Student ID claims verified"
            : detail.student_identity_status === "not_identified" ? "Student ID claims not verified"
              : "Student ID not checked"}</dd></div>
          <div><dt>Updated</dt><dd><time dateTime={detail.updated_at}>{new Date(detail.updated_at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}</time></dd></div>
        </dl>
      </AccessibleDialog>}
    </main>
  </div>;
}
