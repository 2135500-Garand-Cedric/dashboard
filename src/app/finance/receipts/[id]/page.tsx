import { redirect } from "next/navigation";
export default async function LegacyReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) redirect("/finance/expenses");
  redirect(`/finance/expenses/documents/${id}`);
}
