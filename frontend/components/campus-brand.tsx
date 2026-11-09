import { Wrench } from "lucide-react";
import type { ReactNode } from "react";

export default function CampusBrand() {
  return <div className="campus-brand">
    <span className="campus-brand-icon"><Wrench size={20} strokeWidth={1.8} aria-hidden="true" /></span>
    <div><strong>Campus Maintenance</strong><span>Mae Fah Luang University</span></div>
  </div>;
}

export function CampusHeader({ action }: { action: ReactNode }) {
  return <header className="campus-header">
    <div className="campus-header-inner"><CampusBrand />{action}</div>
  </header>;
}
