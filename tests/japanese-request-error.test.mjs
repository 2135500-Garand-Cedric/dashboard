import test from "node:test";
import assert from "node:assert/strict";
import { accountModules } from "./helpers/accounts.mjs";
const { japaneseRequestError } = accountModules({}).load(
  "src/lib/japanese/request-error.ts",
);
test("Japanese failures expose safe diagnostic codes without logging query parameters or private words", () => {
  const original = console.error;
  const logs = [];
  console.error = (value) => logs.push(value);
  try {
    const deep = new Error(
      "ConnectorError: stack depth limit exceeded; private parameter SECRET",
    );
    const result = japaneseRequestError(deep, "statistics", Date.now());
    assert.equal(result.code, "JAPANESE_QUERY_TOO_COMPLEX");
    assert.equal(result.status, 503);
    assert.match(logs[0], /databaseCode=54001/);
    for (const code of ["P2028", "P1008", "P2024", "P2034"]) {
      const failure = japaneseRequestError(
        Object.assign(new Error("SECRET QUERY"), { code }),
        "save practice",
        Date.now(),
      );
      assert.equal(failure.status, 503);
      assert.match(failure.error, /results are still available/);
    }
    assert.equal(
      japaneseRequestError({ code: "P2022" }, "statistics", Date.now()).code,
      "JAPANESE_DATABASE_UPDATE_REQUIRED",
    );
    assert.doesNotMatch(JSON.stringify(logs), /SECRET|parameter|QUERY/);
    assert.equal(
      japaneseRequestError(new Error("SECRET"), "statistics", Date.now())
        .status,
      500,
    );
  } finally {
    console.error = original;
  }
});
