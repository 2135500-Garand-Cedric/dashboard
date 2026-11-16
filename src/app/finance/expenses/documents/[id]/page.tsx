import SupportingRecord from "@/components/finance/SupportingRecord";
import { CURRENCIES } from "@/lib/finance/validation";
import { notFound } from "next/navigation";
export default async function HistoricalRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return <SupportingRecord id={id} kind="receipt" currencies={CURRENCIES} />;
}
