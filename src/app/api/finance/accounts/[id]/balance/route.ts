import { requireOwner } from "@/lib/require-owner";
import { withUserTimeZone } from "@/lib/user-settings";
import { setAccountBalance } from "@/lib/finance/balance-server";
import { financeId } from "@/lib/finance/validation";
import { financeError, financeHeaders } from "@/lib/finance/server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const id = financeId((await context.params).id),
      input = await request.json();
    return Response.json(await withUserTimeZone(() => setAccountBalance(id, input)), {
      headers: financeHeaders,
    });
  } catch (error) {
    return financeError(error, "set the account balance");
  }
}
