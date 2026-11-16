import LegacyActivity from "@/components/finance/LegacyActivity";
import { notFound } from "next/navigation";
export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return <LegacyActivity id={id} />;
}
