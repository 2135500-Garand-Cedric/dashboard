import ActivityDetail from "@/components/finance/ActivityDetail";
import { CURRENCIES } from "@/lib/finance/validation";
import { notFound } from "next/navigation";
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) notFound();
  return <ActivityDetail id={id} kind="transfers" currencies={CURRENCIES} />;
}
