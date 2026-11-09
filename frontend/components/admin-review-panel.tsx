"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import type { CategoryItem, LocationItem } from "@/lib/ticket-view";

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

export default function AdminReviewPanel({ token, categories, locations }: { token: string; categories: CategoryItem[]; locations: LocationItem[] }) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api";

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
    if (!categoryId) return;
    setSaving(item.id);
    try {
      const response = await fetch(`${apiBase}/admin/reviews?id=${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: categoryId }),
      });
      if (!response.ok) throw new Error("Classification failed");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedCategories((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch {
      setError("The ticket could not be classified. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return <section className="admin-review-panel" aria-busy={loading}>
    <div className="overview-panel-heading"><div><p className="eyebrow">ADMIN QUEUE</p><h2>Tickets needing classification</h2></div><button type="button" className="overview-link" onClick={() => void load()} disabled={loading}><RefreshCw size={17} aria-hidden="true" />Refresh</button></div>
    {error && <div className="request-error" role="alert"><TriangleAlert size={20} aria-hidden="true" /><p>{error}</p></div>}
    {loading ? <p className="overview-empty"><RefreshCw className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading review queue…</p>
      : !items.length ? <p className="overview-empty"><CheckCircle2 size={22} aria-hidden="true" />No tickets are waiting for manual review.</p>
      : <div className="request-list">{items.map((item) => {
        const location = item.locations ?? locations.find((entry) => entry.id === item.location_id);
        return <article className="request-row" key={item.id}>
          <div className="request-row-heading"><div><p className="request-id">{item.id}</p><h3>{item.title}</h3></div><span className="overview-badge OPEN">Needs review</span></div>
          <p className="dialog-description">{item.description}</p>
          <p className="request-row-meta"><span>{location ? `${location.building} · ${location.floor_room}` : item.location_text ?? "Location unavailable"}</span><span>{new Date(item.created_at).toLocaleString("en-GB")}</span></p>
          <div className="request-row-actions"><label htmlFor={`review-${item.id}`}>Assign category</label><select id={`review-${item.id}`} value={selectedCategories[item.id] ?? ""} disabled={saving === item.id} onChange={(event) => setSelectedCategories((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" className="send-button" disabled={!selectedCategories[item.id] || saving === item.id} onClick={() => void classify(item)}>{saving === item.id ? "Confirming…" : "Confirm category"}</button></div>
        </article>;
      })}</div>}
  </section>;
}
