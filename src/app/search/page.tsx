import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { Suspense } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import SearchPage from "@/components/search/SearchPage";
export const metadata = { title: "Search dashboard" };
export default async function Page() {
  await requireOwnerPage();
  return (
    <ProtectedLayout>
      <Suspense fallback={<p role="status">Loading search…</p>}>
        <SearchPage />
      </Suspense>
    </ProtectedLayout>
  );
}
