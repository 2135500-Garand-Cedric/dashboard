import { Suspense } from "react";
import ArticleEditor from "@/components/knowledge/ArticleEditor";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading editor…</p>}>
      <ArticleEditor />
    </Suspense>
  );
}
