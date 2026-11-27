import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { Suspense } from "react";
import ArticleEditor from "@/components/knowledge/ArticleEditor";
export default async function Page() {
  await requireOwnerPage();
  return (
    <Suspense fallback={<p>Loading editor…</p>}>
      <ArticleEditor />
    </Suspense>
  );
}
