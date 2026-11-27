import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { Suspense } from "react";
import CalendarDateDetails from "@/components/calendar/CalendarDateDetails";
export default async function Page() {
  await requireOwnerPage();
  return (
    <Suspense fallback={<p role="status">Loading calendar date…</p>}>
      <CalendarDateDetails kind="birthday" />
    </Suspense>
  );
}
