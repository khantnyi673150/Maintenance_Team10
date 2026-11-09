"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BadgeCheck, CalendarDays, ClipboardCheck, FileText, LayoutGrid, LogOut, Menu, Plus, Wrench } from "lucide-react";
import AccessibleDialog from "@/components/accessible-dialog";
import CampusBrand from "@/components/campus-brand";
import type { MaintenanceRole } from "@/lib/maintenance-role";

export type WorkspaceTab = "overview" | "tracker" | "report" | "dispatch" | "reviews" | "identity-test";

const destinations = {
  overview: { label: "Overview", icon: LayoutGrid },
  tracker: { label: "Requests", icon: FileText },
  report: { label: "Report an issue", icon: Wrench },
  dispatch: { label: "Dispatch board", icon: CalendarDays },
  reviews: { label: "Manual review", icon: ClipboardCheck },
  "identity-test": { label: "Identity test", icon: BadgeCheck },
};

export default function WorkspaceShell({ activeTab, role, name, demo, onNavigate, onSignOut, children, maintenanceCategory }: {
  activeTab: WorkspaceTab; role: MaintenanceRole; name: string; demo: boolean; maintenanceCategory?: string | null;
  onNavigate: (tab: WorkspaceTab) => void; onSignOut: () => void; children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = name.trim().split(/[\s._-]+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || (role === "staff" ? "ST" : "RP");
  const isManualReview = role === "staff" && maintenanceCategory === "Manual Review";
  const navigation: WorkspaceTab[] = isManualReview ? ["overview", "reviews"] : ["overview", "tracker"];
  if (role === "reporter") navigation.push("report");
  if (role === "staff" && !isManualReview) navigation.push("dispatch");
  if (role === "admin") navigation.push("reviews");
  //if (role === "staff" || role === "admin") navigation.push("identity-test");
  const roleLabel = role === "staff" ? `${maintenanceCategory ?? "Maintenance"} staff` : role === "admin" ? "Administrator" : "Reporter";
  const title = activeTab === "overview" ? (role === "reporter" ? "My overview" : "Maintenance overview")
    : activeTab === "tracker" && role === "reporter" ? "My requests" : destinations[activeTab].label;

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => { if (event.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const navigationContent = <>
    <nav className="workspace-nav" aria-label="Workspace">
      {navigation.map((tab) => {
        const { label, icon: Icon } = destinations[tab];
        return <button type="button" key={tab} aria-current={activeTab === tab ? "page" : undefined} onClick={() => {
          onNavigate(tab);
          setMenuOpen(false);
        }}><Icon size={20} strokeWidth={1.75} aria-hidden="true" />{tab === "tracker" && role === "reporter" ? "My requests" : label}</button>;
      })}
    </nav>
    <div className="workspace-account">
      <div className="workspace-person"><span className="workspace-avatar" aria-hidden="true">{initials}</span><div><strong title={name}>{name}</strong><span>{roleLabel}</span></div></div>
      <button type="button" onClick={() => { setMenuOpen(false); onSignOut(); }}><LogOut size={19} aria-hidden="true" />Sign out</button>
    </div>
  </>;

  return <div className="maintenance-workspace">
    <a className="workspace-skip" href="#workspace-main">Skip to content</a>
    <aside className="workspace-sidebar">
      <div className="workspace-brand"><CampusBrand /></div>
      {navigationContent}
    </aside>
    <div className="workspace-body">
      <header className="workspace-topbar">
        <button className="btn-switch-role workspace-menu-toggle" type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21} aria-hidden="true" /></button>
        <span className="workspace-mobile-brand">Campus Maintenance</span>
        <div><span className="workspace-role">{roleLabel}</span><span className="workspace-avatar" aria-hidden="true">{initials}</span></div>
      </header>
      <main id="workspace-main" className="app-shell workspace-page" tabIndex={-1}>
        {demo && <div className="local-demo-banner" role="status"><strong>Local preview</strong><span>Sample data · changes disabled</span></div>}
        <div className="workspace-heading">
          <h1>{title}</h1>
          {role === "reporter" && activeTab !== "report" && <button type="button" className="workspace-primary" onClick={() => onNavigate("report")}><Plus size={20} strokeWidth={1.75} aria-hidden="true" />Report an issue</button>}
        </div>
        {children}
      </main>
    </div>
    {menuOpen && <AccessibleDialog id="workspace-navigation" className="workspace-menu-dialog" title="Navigation" onClose={() => setMenuOpen(false)}>{navigationContent}</AccessibleDialog>}
  </div>;
}
