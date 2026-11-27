import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { Suspense } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import WeeklyReportView from "@/components/weekly-report/WeeklyReportView";
export default async function WeeklyReportPage() {
  await requireOwnerPage();
  return (
    <ProtectedLayout>
      <Suspense fallback={<p role="status">Loading weekly report…</p>}>
        <WeeklyReportView />
      </Suspense>
    </ProtectedLayout>
  );
}
