"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, MapPin, RefreshCw, TriangleAlert } from "lucide-react";
import { maintenanceCategories } from "@/lib/maintenance-role";
import type { CategoryItem, LocationItem } from "@/lib/ticket-view";
import AccessibleDialog from "@/components/accessible-dialog";

type ReviewItem = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  category_id: string | null;
  location_id: string;
  location_text?: string | null;
  locations?: { building: string; floor_room: string } | null;
};

export default function AdminReviewPanel({ token, categories, locations, onOpenReview }: {
  token: string; categories: CategoryItem[]; locations: LocationItem[]; onOpenReview?: () => void;
}) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewItem | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";
  const assignableCategories = categories.filter((category) =>
    maintenanceCategories.some(({ value }) => value === category.name),
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/admin/reviews`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error("Review queue unavailable");
      const json = await response.json();
      if (!Array.isArray(json.data)) throw new Error("Invalid review queue");
      setItems(json.data);
    } catch {
      setError("Manual review queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function classify(item: ReviewItem) {
    const categoryId = selectedCategories[item.id];
    if (onOpenReview || loading || saving || !assignableCategories.some((category) => category.id === categoryId)) return;
    setSaving(item.id);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/admin/reviews?id=${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: categoryId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        if (result?.error?.code === "MIGRATION_REQUIRED") {
          setError("Manual Review needs a database update before you can assign categories.");
        } else if (response.status === 404) {
          setItems((current) => current.filter((entry) => entry.id !== item.id));
          setError("This ticket is no longer awaiting review.");
        } else {
          setError("Couldn’t assign the category. Try again.");
        }
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedCategories((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch {
      setError("Couldn’t confirm the assignment. Refresh the queue before retrying.");
    } finally {
      setSaving(null);
    }
  }

  function locationLabel(item: ReviewItem) {
    const location = item.locations ?? locations.find((entry) => entry.id === item.location_id);
    return location ? [location.building, location.floor_room].filter(Boolean).join(" · ") : item.location_text ?? "Location unavailable";
  }

  return <section className="admin-review-panel" aria-label="Review queue" aria-busy={loading}>
    <div className="overview-panel-heading">
      <p className="review-count" role="status">{loading ? "Loading…" : error && !items.length ? "Queue unavailable" : `${items.length} awaiting review`}</p>
      {onOpenReview
        ? <button type="button" className="overview-link" onClick={onOpenReview}>Open Manual Review<ArrowRight size={17} aria-hidden="true" /></button>
        : <button type="button" className="btn-switch-role" onClick={() => void load()} disabled={loading || !!saving}><RefreshCw size={17} aria-hidden="true" />Refresh</button>}
    </div>
    {error && <div className="request-error" role="alert"><TriangleAlert size={20} aria-hidden="true" /><p>{error}</p></div>}
    {!loading && !error && !items.length && <div className="request-empty"><CheckCircle2 size={22} aria-hidden="true" /><p>No requests need review.</p></div>}
    <div className="request-list">{items.map((item) => <article className="request-row compact-request-card" key={item.id}>
      <div className="compact-request-header">
        <div><h2>{item.title}</h2><p className="request-row-meta"><span><MapPin size={15} aria-hidden="true" />{locationLabel(item)}</span></p></div>
        <button type="button" className="overview-link" onClick={() => setDetail(item)}>Details<ArrowRight size={16} aria-hidden="true" /><span className="sr-only"> for {item.title}</span></button>
      </div>
      {!onOpenReview && <div className="review-actions">
        <div className="field"><label htmlFor={`review-${item.id}`}>Category</label><select id={`review-${item.id}`} value={selectedCategories[item.id] ?? ""} disabled={loading || !!saving} onChange={(event) => setSelectedCategories((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose a category</option>{assignableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
        <button type="button" className="send-button" disabled={!selectedCategories[item.id] || loading || !!saving} onClick={() => void classify(item)}>{saving === item.id ? "Assigning…" : "Assign"}</button>
      </div>}
    </article>)}</div>
    {detail && <AccessibleDialog id="review-details" title="Request details" onClose={() => setDetail(null)}>
      <h3 className="request-detail-title">{detail.title}</h3>
      <p className="dialog-description">{detail.description}</p>
      <dl className="public-detail-list">
        <div><dt>Request ID</dt><dd>{detail.id}</dd></div>
        <div><dt>Location</dt><dd>{locationLabel(detail)}</dd></div>
        <div><dt>Submitted</dt><dd><time dateTime={detail.created_at}>{new Date(detail.created_at).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}</time></dd></div>
      </dl>
    </AccessibleDialog>}
  </section>;
}
