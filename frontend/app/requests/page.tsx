import type { Metadata } from "next";
import { Suspense } from "react";
import PublicReporterDashboard from "@/components/public-reporter-dashboard";

export const metadata: Metadata = {
  title: "Report or track a repair | MFU Campus Maintenance",
};

export default function RequestsPage() {
  return (
    <Suspense fallback={<main className="public-main" role="status">Opening maintenance requests…</main>}>
      <PublicReporterDashboard />
    </Suspense>
  );
}
