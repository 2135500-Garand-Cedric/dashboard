import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { Suspense } from "react";
import AllWork from "@/components/work/AllWork";
export default async function TodosPage() {
  await requireOwnerPage();
  return (
    <Suspense fallback={<p role="status">Loading work…</p>}>
      <AllWork />
    </Suspense>
  );
}
