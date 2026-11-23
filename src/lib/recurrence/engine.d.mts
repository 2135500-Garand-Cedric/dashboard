import type { Prisma, PrismaClient, RecurrenceSeries } from "@/generated/prisma";
export function generateSeries(
  db: Prisma.TransactionClient,
  series: RecurrenceSeries,
  through: string,
): Promise<void>;
export function ensureOccurrences(
  db: PrismaClient,
  userId?: number,
  now?: Date,
  through?: string | null,
): Promise<void>;

export function ensureSeriesWindow(
  db: Prisma.TransactionClient,
  series: RecurrenceSeries,
  now?: Date,
  through?: string | null,
): Promise<void>;
