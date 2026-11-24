import { Suspense } from "react";
import KnowledgeHome from "@/components/knowledge/KnowledgeHome";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading Knowledge…</p>}>
      <KnowledgeHome />
    </Suspense>
  );
}
