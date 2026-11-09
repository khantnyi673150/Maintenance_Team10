"use client";

import type { ReactNode } from "react";
import { CalendarDays, ClipboardCheck, FileText, LayoutGrid, LogOut, Menu, Plus, Wrench, X } from "lucide-react";
import { useState } from "react";

export type WorkspaceTab = "overview" | "tracker" | "report" | "dispatch" | "reviews";
const labels: Record<WorkspaceTab, string> = { overview: "Overview", tracker: "My Requests", report: "Report an Issue", dispatch: "Dispatch Board", reviews: "Manual Review" };

export default function WorkspaceShell({ activeTab, role, name, demo, onNavigate, onSignOut, children, maintenanceCategory }: {
  activeTab: WorkspaceTab; role: "staff" | "reporter" | "admin"; name: string; demo: boolean; maintenanceCategory?: string | null;
  onNavigate: (tab: WorkspaceTab) => void; onSignOut: () => void; children: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const initials = name.trim().split(/[\s._-]+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || (role === "staff" ? "ST" : "RP");
  const canReview = role === "admin" || (role === "staff" && maintenanceCategory === "Manual Review");
  const navigation = [{ tab: "overview", icon: LayoutGrid }, { tab: "tracker", icon: FileText }, ...(role === "reporter" ? [{ tab: "report", icon: Wrench }] : []), ...(role === "staff" ? [{ tab: "dispatch", icon: CalendarDays }] : []), ...(canReview ? [{ tab: "reviews", icon: ClipboardCheck }] : [])] as const;
  const title = activeTab === "overview" ? role === "staff" ? "Maintenance overview" : role === "admin" ? "Admin overview" : "My overview" : labels[activeTab];
  return <div className="maintenance-workspace">
    <a className="workspace-skip" href="#workspace-main">Skip to content</a>
    {mobileMenuOpen && <button className="workspace-mobile-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
    <aside className="workspace-sidebar">
      <div className="workspace-brand"><span>Campus <br />Maintenance</span><p>Mae Fah Luang University</p><button className="workspace-mobile-close" type="button" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)}><X size={20} /></button></div>
      <nav aria-label="Workspace" className="workspace-nav">{navigation.map(({ tab, icon: Icon }) => <button key={tab} type="button" aria-current={activeTab === tab ? "page" : undefined} onClick={() => { onNavigate(tab as WorkspaceTab); setMobileMenuOpen(false); }}><Icon size={22} strokeWidth={1.75} aria-hidden="true" /><span>{labels[tab as WorkspaceTab]}</span></button>)}</nav>
      <div className="workspace-account"><div className="workspace-person"><span className="workspace-avatar" aria-hidden="true">{initials}</span><div><strong title={name}>{name}</strong><span>{role === "staff" ? "Staff" : role === "admin" ? "Administrator" : "Reporter"}</span></div></div><button type="button" onClick={onSignOut}><LogOut size={22} strokeWidth={1.75} aria-hidden="true" />Sign out</button></div>
    </aside>
    <div className="workspace-body">
      <header className="workspace-topbar"><button className="workspace-menu-toggle" type="button" aria-label="Open navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}><Menu size={21} /></button><p>Workspace <span aria-hidden="true">/</span> <strong>{labels[activeTab]}</strong></p><div><span className="workspace-role">{role === "staff" ? `${maintenanceCategory ?? "Maintenance"} staff` : role === "admin" ? "Administrator" : "Reporter view"}</span><span className="workspace-avatar" aria-hidden="true">{initials}</span></div></header>
      <main id="workspace-main" className="app-shell workspace-page" tabIndex={-1}>
        {demo && <div className="local-demo-banner" role="status"><strong>Local preview</strong><span>Sample data · changes disabled</span></div>}
        <div className="workspace-heading"><h1>{title}</h1><div><time dateTime={new Date().toISOString().slice(0, 10)}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date())}</time>{role === "reporter" && activeTab !== "report" && <button type="button" className="workspace-primary" onClick={() => onNavigate("report")}><Plus size={22} strokeWidth={1.75} aria-hidden="true" />Report an issue</button>}</div></div>
        {children}
      </main>
    </div>
  </div>;
}
