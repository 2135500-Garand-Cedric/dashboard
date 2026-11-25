import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkModule } from "./helpers/work-support.mjs";

const validation = loadWorkModule("src/lib/finance/validation.ts");
const transactions = loadWorkModule("src/lib/finance/transactions.ts", {
  "./validation": validation,
});
const core = loadWorkModule("src/lib/finance/reimbursements.ts", {
  "./validation": validation,
  "./transactions": transactions,
});

test("reimbursements validate decimal text, tracking choices and stale-write versions", () => {
  assert.equal(
    core.reimbursementInput({ contactId: 1, amount: "1000.10", expectedUpdatedAt: null }, "plan")
      .amount,
    "1000.1000",
  );
  assert.equal(
    core.reimbursementInput({ remove: true, expectedUpdatedAt: null }, "plan").remove,
    true,
  );
  for (const value of [
    { person: "Dad", amount: "1", expectedUpdatedAt: null },
    { contactId: -1, amount: "1", expectedUpdatedAt: null },
    { contactId: null, amount: "1", expectedUpdatedAt: null },
    { contactId: 1, amount: "0", expectedUpdatedAt: null },
    { contactId: 1, amount: "-1", expectedUpdatedAt: null },
    { contactId: 1, amount: 100, expectedUpdatedAt: null },
    { contactId: 1, amount: "1e3", expectedUpdatedAt: null },
    { contactId: 1, amount: "1" },
    { contactId: 1, amount: "1", expectedUpdatedAt: "invalid" },
    { contactId: 1, amount: "1", expectedUpdatedAt: null, userId: 2 },
  ])
    assert.throws(() => core.reimbursementInput(value, "plan"));
  assert.equal(
    core.reimbursementInput({ expenseId: 7, amount: "0.01", expectedUpdatedAt: null }, "allocation")
      .expenseId,
    7,
  );
  for (const expenseId of [null, "7", -1, 0, 1.2, 2147483648])
    assert.throws(() =>
      core.reimbursementInput({ expenseId, amount: "1", expectedUpdatedAt: null }, "allocation"),
    );
  assert.equal(core.reimbursementStatus("1000.0000", "0.0000"), "AWAITING");
  assert.equal(core.reimbursementStatus("1000.0000", "999.9900"), "PARTIAL");
  assert.equal(core.reimbursementStatus("1000.0000", "1000.0000"), "COMPLETE");
  assert.equal(core.reimbursementStatus("900719925474099.1234", "900719925474099.1233"), "PARTIAL");
});

test("all reimbursement endpoints deny access before touching request bodies or financial data", async () => {
  for (const status of [401, 403]) {
    const fail = () => assert.fail("Unauthorized reimbursement access");
    const routes = loadWorkModule("src/app/api/finance/activities/[id]/reimbursements/route.ts", {
      "@/lib/require-owner": { requireOwner: async () => Response.json({}, { status }) },
      "@/lib/finance/server": { financeHeaders: {}, financeError: fail },
      "@/lib/finance/validation": { financeId: fail },
      "@/lib/finance/reimbursement-server": {
        getReimbursements: fail,
        saveReimbursementPlan: fail,
        saveReimbursementAllocation: fail,
        removeReimbursementAllocation: fail,
      },
    });
    for (const method of ["GET", "PUT", "POST", "DELETE"])
      assert.equal(
        (await routes[method]({ json: fail }, { params: Promise.resolve({ id: "1" }) })).status,
        status,
      );
  }
});
