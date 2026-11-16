import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "../generated/prisma";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaSchema: string | undefined;
}

// HMR keeps global objects alive when the generated client is replaced. Reuse
// the connection pool only while it still understands the current schema.
const schema = createHash("sha256").update(JSON.stringify(Prisma.dmmf.datamodel)).digest("hex");
export const prisma =
  (process.env.NODE_ENV !== "production" && global.prismaSchema === schema
    ? global.prisma
    : undefined) ||
  new PrismaClient({
    // Financial values and search terms must never enter query logs.
    log: [],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
  global.prismaSchema = schema;
}
