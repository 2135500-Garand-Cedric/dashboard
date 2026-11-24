import { Suspense } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import WeeklyReportView from "@/components/weekly-report/WeeklyReportView";
export default function WeeklyReportPage() {
  return (
    <ProtectedLayout>
      <Suspense fallback={<p role="status">Loading weekly report…</p>}>
        <WeeklyReportView />
      </Suspense>
    </ProtectedLayout>
  );
}
