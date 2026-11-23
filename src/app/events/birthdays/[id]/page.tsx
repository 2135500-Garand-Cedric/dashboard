import { Suspense } from "react";
import CalendarDateDetails from "@/components/calendar/CalendarDateDetails";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading calendar date…</p>}>
      <CalendarDateDetails kind="birthday" />
    </Suspense>
  );
}
