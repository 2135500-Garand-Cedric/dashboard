import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { Suspense } from "react";
import ArticleEditor from "@/components/knowledge/ArticleEditor";
import { notFound } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return (
    <Suspense fallback={<p>Loading editor…</p>}>
      <ArticleEditor id={Number(id)} />
    </Suspense>
  );
}
