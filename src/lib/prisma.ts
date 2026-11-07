import { PrismaClient } from "../generated/prisma";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    // Financial values and search terms must never enter query logs.
    log: [],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
