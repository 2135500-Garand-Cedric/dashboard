import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOriginalRows,
  assertRehearsalEnvironment,
} from "../scripts/rehearse-work-migrations.mjs";
import { assertShowcaseEnvironment } from "../scripts/work-showcase.mjs";

test("migration rehearsals fail closed outside the explicit disposable connection", () => {
  const expected = {
    DATABASE_URL: "postgresql://work_test:local@work-db:5432/work_test",
    WORK_MANAGEMENT_DISPOSABLE: "1",
    RUN_WORK_REHEARSAL: "1",
    NODE_ENV: "test",
  };
  const previous = Object.fromEntries(
    Object.keys(expected).map((name) => [name, process.env[name]]),
  );
  try {
    Object.assign(process.env, expected);
    assert.doesNotThrow(() => assertRehearsalEnvironment());
    for (const [name, value] of [
      ["NODE_ENV", "production"],
      ["NODE_ENV", "development"],
      ["WORK_MANAGEMENT_DISPOSABLE", "0"],
      ["RUN_WORK_REHEARSAL", "0"],
      ["DATABASE_URL", "postgresql://user:local@dashboard-db:5432/work_test"],
      ["DATABASE_URL", "postgresql://user:local@work-db:5432/dashboard"],
    ]) {
      process.env[name] = value;
      assert.throws(() => assertRehearsalEnvironment());
      process.env[name] = expected[name];
    }
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("cumulative preservation checks every original value and ID while allowing additive columns", () => {
  const before = {
    columns: ["id", "amount", "updatedAt"].map((column_name) => ({
      table_name: "Record",
      column_name,
    })),
    tables: { Record: { rows: ['{"id":7,"amount":"12.34","updatedAt":"2001-01-01"}'] } },
  };
  const after = structuredClone(before);
  after.tables.Record.rows = ['{"id":7,"amount":"12.34","updatedAt":"2001-01-01","newField":null}'];
  assert.doesNotThrow(() => assertOriginalRows(before, after));
  for (const body of [
    { id: 8, amount: "12.34", updatedAt: "2001-01-01" },
    { id: 7, amount: "12.35", updatedAt: "2001-01-01" },
    { id: 7, amount: "12.34", updatedAt: "2001-01-02" },
  ]) {
    after.tables.Record.rows = [JSON.stringify(body)];
    assert.throws(() => assertOriginalRows(before, after));
  }
  after.tables.Record.rows = [];
  assert.throws(() => assertOriginalRows(before, after));
});

test("showcase cannot seed a restored work database or a production environment", () => {
  const expected = {
    NODE_ENV: "test",
    WORK_MANAGEMENT_DISPOSABLE: "1",
    ALLOW_WORK_EXAMPLES: "1",
    DATABASE_URL: "postgresql://work_test:local@work-db:5432/work_examples",
  };
  const previous = Object.fromEntries(
    Object.keys(expected).map((name) => [name, process.env[name]]),
  );
  try {
    Object.assign(process.env, expected);
    assert.doesNotThrow(() => assertShowcaseEnvironment());
    process.env.DATABASE_URL = "postgresql://work_test:local@work-db:5432/work_test";
    assert.throws(() => assertShowcaseEnvironment());
    process.env.DATABASE_URL = expected.DATABASE_URL;
    process.env.NODE_ENV = "production";
    assert.throws(() => assertShowcaseEnvironment());
    process.env.NODE_ENV = "test";
    process.env.ALLOW_WORK_EXAMPLES = "0";
    assert.throws(() => assertShowcaseEnvironment());
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
