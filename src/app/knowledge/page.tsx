import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { Suspense } from "react";
import KnowledgeHome from "@/components/knowledge/KnowledgeHome";
export default async function Page() {
  await requireOwnerPage();
  return (
    <Suspense fallback={<p>Loading Knowledge…</p>}>
      <KnowledgeHome />
    </Suspense>
  );
}
