import { statementPrefill } from "@/lib/finance/statement-prefill";
import NewActivity from "@/components/finance/NewActivity";
import { CURRENCIES } from "@/lib/finance/validation";
export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <NewActivity
      kind="expenses"
      currencies={CURRENCIES}
      prefill={statementPrefill(await searchParams)}
    />
  );
}
