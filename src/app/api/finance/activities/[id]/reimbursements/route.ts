import { requireOwner } from "@/lib/require-owner";
import { financeHeaders, financeError } from "@/lib/finance/server";
import { financeId } from "@/lib/finance/validation";
import {
  getReimbursements,
  saveReimbursementPlan,
  saveReimbursementAllocation,
  removeReimbursementAllocation,
} from "@/lib/finance/reimbursement-server";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return Response.json(
      await getReimbursements(
        financeId((await context.params).id),
        new URL(request.url).searchParams.get("q") ?? "",
      ),
      { headers: financeHeaders },
    );
  } catch (error) {
    return financeError(error, "load reimbursements");
  }
}
export async function PUT(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const id = financeId((await context.params).id);
    return Response.json(await saveReimbursementPlan(id, await request.json()), {
      headers: financeHeaders,
    });
  } catch (error) {
    return financeError(error, "save reimbursement tracking");
  }
}
export async function POST(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const id = financeId((await context.params).id);
    return Response.json(await saveReimbursementAllocation(id, await request.json()), {
      headers: financeHeaders,
    });
  } catch (error) {
    return financeError(error, "allocate reimbursement");
  }
}
export async function DELETE(request: Request, context: Context) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    const id = financeId((await context.params).id);
    const linkId = financeId(new URL(request.url).searchParams.get("link") ?? "");
    return Response.json(
      await removeReimbursementAllocation(id, linkId, request.headers.get("If-Match")),
      { headers: financeHeaders },
    );
  } catch (error) {
    return financeError(error, "unlink reimbursement");
  }
}
