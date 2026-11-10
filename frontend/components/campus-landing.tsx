import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, FileText, Plus, Wrench } from "lucide-react";
import { CampusHeader } from "@/components/campus-brand";
import styles from "./campus-landing.module.css";

const repairStages = [
  { icon: FileText, label: "Submitted" },
  { icon: Wrench, label: "In progress" },
  { icon: CheckCircle2, label: "Finished" },
];

export default function CampusLanding() {
  return (
    <div className={styles.page}>
      <CampusHeader universityFirst action={<Link className="btn-switch-role" href="/login">Staff sign in<ArrowRight size={16} aria-hidden="true" /></Link>} />
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="campus-landing-title">
          <h1 id="campus-landing-title">Report and track campus repairs</h1>
          <p>Report a campus issue and follow its repair. No sign-in required.</p>
          <div className={styles.actions}>
            <Link className={`workspace-primary ${styles.primary}`} href="/requests"><Plus size={19} aria-hidden="true" />Report an issue</Link>
            <Link className={`btn-switch-role ${styles.secondary}`} href="/requests?view=track"><ClipboardList size={18} aria-hidden="true" />Track requests</Link>
          </div>
        </section>
        <section className={styles.progress} aria-labelledby="campus-landing-progress">
          <h2 id="campus-landing-progress">Repair progress</h2>
          <ol className={styles.steps} role="list">
            {repairStages.map(({ icon: Icon, label }) => (
              <li key={label}>
                <Icon className={styles.stepIcon} strokeWidth={1.65} aria-hidden="true" />
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
