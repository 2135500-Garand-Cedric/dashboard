import { requireOwnerPage } from "@/lib/accounts/owner-page";
import { dashboardReturn } from "@/lib/dashboard-quick-add";
import { statementPrefill } from "@/lib/finance/statement-prefill";
import NewActivity from "@/components/finance/NewActivity";
import { CURRENCIES } from "@/lib/finance/validation";
export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwnerPage();
  const params = await searchParams;
  return (
    <NewActivity
      kind="expenses"
      currencies={CURRENCIES}
      prefill={statementPrefill(params)}
      returnTo={dashboardReturn(params.returnTo)}
    />
  );
}
