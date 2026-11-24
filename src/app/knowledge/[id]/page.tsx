import ArticleDetail from "@/components/knowledge/ArticleDetail";
import { notFound } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return <ArticleDetail id={Number(id)} />;
}
