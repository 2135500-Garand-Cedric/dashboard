import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { statementPrefill } from "@/lib/finance/statement-prefill";
import { NewIncomeEditor } from "@/components/finance/IncomeEditor";
import { CURRENCIES } from "@/lib/finance/validation";

export const dynamic = "force-dynamic";

export default async function NewIncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwnerPage();
  return <NewIncomeEditor currencies={CURRENCIES} prefill={statementPrefill(await searchParams)} />;
}
