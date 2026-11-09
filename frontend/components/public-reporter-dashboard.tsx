"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Search, Wrench } from "lucide-react";

type PublicCategory = { id: string; name: string; sla_hours?: number };
type PublicLocation = { id: string; building: string; floor_room: string };
const reporterCategories = ["Plumbing", "Electrical", "HVAC", "Safety"] as const;
type PublicTicket = {
  reference_number: string;
  title: string;
  description: string;
  status: "STARTED" | "IN_PROGRESS" | "FINISHED";
  created_at: string;
  updated_at: string;
  category: { id: string | null; name: string };
  location: PublicLocation;
};

const statusLabels = {
  STARTED: "Started",
  IN_PROGRESS: "In progress",
  FINISHED: "Finished / Fixed",
} as const;

export default function PublicReporterDashboard() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [filter, setFilter] = useState<"ALL" | keyof typeof statusLabels>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "", location: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metadataResponse, ticketsResponse] = await Promise.all([
        fetch(`${apiBase}/public/metadata`, { cache: "no-store" }),
        fetch(`${apiBase}/public/work-orders?limit=100`, { cache: "no-store" }),
      ]);
      if (!metadataResponse.ok || !ticketsResponse.ok) throw new Error("The public dashboard is unavailable.");
      const metadata = await metadataResponse.json();
      const ticketData = await ticketsResponse.json();
      setCategories(Array.isArray(metadata.data?.categories) ? metadata.data.categories : []);
      setTickets(Array.isArray(ticketData.data) ? ticketData.data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The public dashboard is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    const refreshTimer = window.setInterval(() => { void loadData(); }, 30000);
    return () => window.clearInterval(refreshTimer);
  }, [loadData]);

  const visibleTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = filter === "ALL" || ticket.status === filter;
      const matchesSearch = !query || [ticket.reference_number, ticket.title, ticket.description, ticket.category.name, ticket.location.building, ticket.location.floor_room]
        .some((value) => value.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [filter, search, tickets]);

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmittedReference(null);
    try {
      const response = await fetch(`${apiBase}/public/work-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, category: form.category === "Unknown" ? null : form.category }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "The ticket could not be submitted.");
      setSubmittedReference(result.data.reference_number);
      setForm({ title: "", description: "", category: "", location: "" });
      await loadData();
    } catch (submitFailure) {
      setSubmitError(submitFailure instanceof Error ? submitFailure.message : "The ticket could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="public-dashboard">
      <header className="public-header">
        <div className="public-brand"><span className="public-brand-mark"><Wrench size={22} aria-hidden="true" /></span><div><strong>Campus Maintenance</strong><span>Mae Fah Luang University</span></div></div>
        <a className="public-staff-link" href="/login">Staff sign in</a>
      </header>
      <section className="public-hero">
        <div><p className="public-eyebrow">PUBLIC REPORTER DASHBOARD</p><h1>Help us keep campus running.</h1><p>Report a maintenance issue without creating an account, then use the public tracker to follow its latest status.</p></div>
        <div className="public-status-note"><CheckCircle2 size={20} aria-hidden="true" /><span>Every ticket follows Started → In progress → Finished / Fixed.</span></div>
      </section>

      <section className="public-grid">
        <form className="public-card public-report-card" onSubmit={submitTicket} aria-busy={submitting}>
          <div className="public-card-heading"><p className="public-card-kicker">SUBMIT A REPORT</p><h2>What needs attention?</h2><p>No account or personal information is required.</p></div>
          <label>Issue title<input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Light is not working in Room 204" /></label>
          <label>Description<textarea required maxLength={10000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the issue, visible symptoms, and anything staff should know. Do not include names, phone numbers, or passwords." /></label>
          <div className="public-form-grid">
            <label>Location<input required maxLength={300} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="e.g. C1, Floor 2, Room 204" /></label>
            <label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">Choose category</option>{reporterCategories.map((category) => <option key={category} value={category}>{category}</option>)}<option value="Unknown">Unknown — send to Manual Review</option></select></label>
          </div>
          <p className="public-privacy-note">For your privacy, public ticket text is filtered for common contact details. Please avoid personal or sensitive information.</p>
          {submitError && <p className="public-form-error" role="alert">{submitError}</p>}
          {submittedReference && <p className="public-success" role="status"><CheckCircle2 size={17} aria-hidden="true" />Submitted. Reference: <strong>{submittedReference}</strong></p>}
          <button className="public-submit" disabled={submitting}>{submitting ? <><LoaderCircle size={17} className="animate-spin" aria-hidden="true" />Submitting…</> : "Submit maintenance report"}</button>
        </form>

        <section className="public-card public-tracker-card" aria-labelledby="public-tracker-title">
          <div className="public-card-heading"><p className="public-card-kicker">PUBLIC TICKET TRACKER</p><h2 id="public-tracker-title">Submitted maintenance tickets</h2><p>Search by reference, issue, category, or location.</p></div>
          <div className="public-toolbar"><label className="public-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search tickets</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets" /></label><button type="button" className="public-refresh" onClick={() => void loadData()} aria-label="Refresh tickets"><RefreshCw size={17} aria-hidden="true" /></button></div>
          <div className="public-filters" role="tablist" aria-label="Ticket status"><button type="button" className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>All</button>{Object.entries(statusLabels).map(([key, label]) => <button type="button" className={filter === key ? "active" : ""} key={key} onClick={() => setFilter(key as keyof typeof statusLabels)}>{label}</button>)}</div>
          {error && <div className="public-empty" role="alert"><p>{error}</p><button type="button" onClick={() => void loadData()}>Try again</button></div>}
          {loading && !error && <p className="public-loading" role="status">Loading submitted tickets…</p>}
          {!loading && !error && !visibleTickets.length && <div className="public-empty"><p>No tickets match this view.</p></div>}
          <div className="public-ticket-list">{visibleTickets.map((ticket) => <article className="public-ticket" key={ticket.reference_number}><div className="public-ticket-top"><div><p className="public-reference">REF {ticket.reference_number}</p><h3>{ticket.title}</h3></div><span className={`public-status ${ticket.status.toLowerCase()}`}>{statusLabels[ticket.status]}</span></div><p className="public-ticket-description">{ticket.description}</p><div className="public-ticket-meta"><span>{ticket.category.name}</span><span>{ticket.location.building} · {ticket.location.floor_room}</span><time dateTime={ticket.updated_at}>Updated {new Date(ticket.updated_at).toLocaleString()}</time></div></article>)}</div>
        </section>
      </section>
    </main>
  );
}
