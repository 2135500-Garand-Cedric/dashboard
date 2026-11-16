import { redirect } from "next/navigation";
export default async function LegacyMatchingPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; source?: string }>;
}) {
  const { kind, source } = await searchParams;
  if (source && /^[1-9]\d*$/.test(source) && Number(source) <= 2147483647) {
    if (kind === "RECEIPT") redirect(`/finance/expenses/documents/${source}?matches=1`);
    if (kind === "INCOME") redirect(`/finance/income/${source}?matches=1`);
    if (kind === "DUPLICATE" || kind === "REFUND")
      redirect(`/finance/transactions/${source}?matches=1`);
  }
  redirect("/finance/imports");
}
