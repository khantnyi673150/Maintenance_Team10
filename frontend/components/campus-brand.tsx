import Link from "next/link";
import { Wrench } from "lucide-react";
import type { ReactNode } from "react";

export default function CampusBrand({ universityFirst = false }: { universityFirst?: boolean }) {
  return <div className="campus-brand">
    <span className="campus-brand-icon"><Wrench size={20} strokeWidth={1.8} aria-hidden="true" /></span>
    <div>
      <strong>{universityFirst ? "Mae Fah Luang University" : "Campus Maintenance"}</strong>
      <span>{universityFirst ? "Campus Maintenance" : "Mae Fah Luang University"}</span>
    </div>
  </div>;
}

export function CampusHeader({ action, homeHref, universityFirst }: { action: ReactNode; homeHref?: string; universityFirst?: boolean }) {
  const brand = <CampusBrand universityFirst={universityFirst} />;
  return <header className="campus-header">
    <div className="campus-header-inner">
      {homeHref ? <Link href={homeHref}>{brand}</Link> : brand}
      {action}
    </div>
  </header>;
}
