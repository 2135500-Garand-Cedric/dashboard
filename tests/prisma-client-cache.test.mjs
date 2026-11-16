import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkModule } from "./helpers/work-support.mjs";

test("development reloads reuse the pool only for the same generated schema", () => {
  const previous = {
    client: global.prisma,
    schema: global.prismaSchema,
    environment: process.env.NODE_ENV,
  };
  let created = 0;
  const datamodel = { models: [{ name: "Todo", fields: [{ name: "id", type: "Int" }] }] };
  class Client {
    constructor() {
      this.number = ++created;
    }
  }
  const load = () =>
    loadWorkModule("src/lib/prisma.ts", {
      "../generated/prisma": { PrismaClient: Client, Prisma: { dmmf: { datamodel } } },
    }).prisma;
  try {
    process.env.NODE_ENV = "development";
    // A long-running process can still have a singleton from before the fix.
    global.prisma = { stale: true };
    delete global.prismaSchema;
    const first = load();
    assert.equal(first.number, 1);
    assert.equal(load(), first, "Ordinary page edits must not create connection pools");
    datamodel.models[0].fields.push({ name: "activityTypeId", type: "Int" });
    const updated = load();
    assert.notEqual(updated, first, "A pre-migration client cannot serve new relation queries");
    assert.equal(updated.number, 2);
    assert.equal(load(), updated);
    process.env.NODE_ENV = "production";
    assert.notEqual(load(), updated, "Production must not inherit a development singleton");
    assert.equal(global.prisma, updated, "Production must not modify the development cache");
  } finally {
    if (previous.client === undefined) delete global.prisma;
    else global.prisma = previous.client;
    if (previous.schema === undefined) delete global.prismaSchema;
    else global.prismaSchema = previous.schema;
    if (previous.environment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.environment;
  }
});
