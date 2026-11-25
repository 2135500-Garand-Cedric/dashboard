import { Suspense } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import SearchPage from "@/components/search/SearchPage";
export const metadata = { title: "Search dashboard" };
export default function Page() {
  return (
    <ProtectedLayout>
      <Suspense fallback={<p role="status">Loading search…</p>}>
        <SearchPage />
      </Suspense>
    </ProtectedLayout>
  );
}
