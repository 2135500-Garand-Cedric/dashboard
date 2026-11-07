import StatementDetail from "@/components/finance/StatementDetail";
import { notFound } from "next/navigation";
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return <StatementDetail id={id} />;
}
