import { requireOwner } from "@/lib/require-owner";
import { withUserTimeZone } from "@/lib/user-settings";
import { listBalances } from "@/lib/finance/balance-server";
import { financeError, financeHeaders } from "@/lib/finance/server";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return Response.json(await withUserTimeZone(listBalances), { headers: financeHeaders });
  } catch (error) {
    return financeError(error, "load account balances");
  }
}
