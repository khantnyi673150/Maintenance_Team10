"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { maintenanceCategories, type MaintenanceCategory } from "@/lib/maintenance-role";

type StaffMember = { id: string; email: string | null; name: string | null; category: MaintenanceCategory | null };
type Feedback = { target: string; kind: "error" | "success"; message: string };

const categoryOptions = maintenanceCategories.map(({ value }) => <option key={value}>{value}</option>);

export default function StaffAccounts({ apiBase, token }: { apiBase: string; token: string }) {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const returnFocus = useRef<string | null>(null);
  const url = `${apiBase}/admin/staff`;

  useEffect(() => {
    if (editingId) {
      document.getElementById(`category-${editingId}`)?.focus();
    } else if (returnFocus.current) {
      document.getElementById(`edit-staff-${returnFocus.current}`)?.focus();
      returnFocus.current = null;
    }
  }, [editingId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const { data } = await response.json();
        if (!controller.signal.aborted) setMembers(data);
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [url, token, refresh]);

  async function save(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const category = values.get("category");
    const body = id ? { id, category } : { email: values.get("email"), name: values.get("name"), category };
    const target = id ?? "new";
    setSaving(target);
    setFeedback(null);
    try {
      const response = await fetch(url, {
        method: id ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setFeedback({ target, kind: "error", message: result.error?.message ?? "Couldn’t save the staff account. Try again." });
        return;
      }
      if (id) {
        setEditingId(null);
      } else {
        form.reset();
      }
      setMembers((previous) => id
        ? previous.map((member) => member.id === id ? result.data : member)
        : [...previous, result.data]);
      setFeedback({
        target,
        kind: "success",
        message: id ? "Category updated." : "Account created. The staff member can set their password using Forgot password.",
      });
    } catch {
      setFeedback({ target, kind: "error", message: "Couldn’t save the staff account. Try again." });
    } finally {
      setSaving(null);
    }
  }

  function editCategory(id: string) {
    returnFocus.current = id;
    setFeedback(null);
    setEditingId(id);
  }

  function cancelEdit() {
    setFeedback(null);
    setEditingId(null);
  }

  function renderFeedback(target: string) {
    if (feedback?.target !== target) return null;
    const isError = feedback.kind === "error";
    return <p className={isError ? "request-error staff-feedback" : "staff-feedback staff-feedback-success"} role={isError ? "alert" : "status"}>{feedback.message}</p>;
  }

  return (
    <div className="tab-content-container staff-accounts">
      <section className="panel" aria-labelledby="new-staff-heading">
        <h2 id="new-staff-heading">Add a staff member</h2>
        <p className="staff-panel-intro">Verify their campus email and choose the category they will handle.</p>
        <form onSubmit={(event) => void save(event)}>
          <fieldset className="staff-account-fields staff-create-fields" disabled={saving !== null || loading || loadError}>
            <legend className="sr-only">New staff account</legend>
            <div className="field"><label htmlFor="staff-name">Full name</label><input id="staff-name" name="name" maxLength={120} required /></div>
            <div className="field"><label htmlFor="staff-email">Campus email</label><input id="staff-email" name="email" type="email" maxLength={254} required /></div>
            <div className="field"><label htmlFor="staff-category">Category</label><select id="staff-category" name="category" defaultValue="" required><option value="" disabled>Choose a category</option>{categoryOptions}</select></div>
            <button className="workspace-primary" type="submit">{saving === "new" ? "Creating…" : "Create account"}</button>
          </fieldset>
        </form>
        {renderFeedback("new")}
      </section>
      <section className="panel" aria-labelledby="staff-list-heading" aria-busy={loading}>
        <h2 id="staff-list-heading">Existing staff</h2>
        {loading && <p className="staff-list-message" role="status">Loading staff accounts…</p>}
        {loadError && <div className="request-error staff-load-error"><span role="alert">Couldn’t load staff accounts.</span><button className="btn-switch-role" type="button" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
        {!loading && !loadError && (members.length ? <ul className="staff-account-list">
          {members.map((member) => <li key={member.id} className="staff-account-row">
            <div className="staff-account-person">
              <strong>{member.name || member.email || "Staff member"}</strong>
              {member.name && member.email && <p>{member.email}</p>}
            </div>
            {editingId === member.id ? <form onSubmit={(event) => void save(event, member.id)}>
              <fieldset className="staff-account-fields staff-category-fields" disabled={saving !== null}>
                <div className="field"><label htmlFor={`category-${member.id}`}>Category <span className="sr-only">for {member.name || member.email || "staff member"}</span></label><select id={`category-${member.id}`} name="category" defaultValue={member.category ?? ""} required><option value="" disabled>Unassigned</option>{categoryOptions}</select></div>
                <div className="staff-edit-actions">
                  <button className="workspace-primary" type="submit">{saving === member.id ? "Saving…" : "Save category"}</button>
                  <button className="btn-switch-role" type="button" onClick={cancelEdit}>Cancel</button>
                </div>
              </fieldset>
            </form> : <div className="staff-category-summary">
              <span>{member.category ?? "Unassigned"}</span>
              <button id={`edit-staff-${member.id}`} className="btn-switch-role" type="button" disabled={editingId !== null || saving !== null} onClick={() => editCategory(member.id)}>
                Edit<span className="sr-only"> category for {member.name || member.email || "staff member"}</span>
              </button>
            </div>}
            {renderFeedback(member.id)}
          </li>)}
        </ul> : <p className="staff-list-message">No staff accounts yet.</p>)}
      </section>
    </div>
  );
}
