import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { Suspense } from "react";
import MyWork from "@/components/work/MyWork";
export default async function MyWorkPage() {
  await requireOwnerPage();
  return (
    <Suspense fallback={<p role="status">Loading My Work…</p>}>
      <MyWork />
    </Suspense>
  );
}
