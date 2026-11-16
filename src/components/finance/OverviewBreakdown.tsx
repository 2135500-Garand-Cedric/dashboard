"use client";
import Link from "next/link";
import { displayAmount } from "@/lib/finance/transactions";

export default function OverviewBreakdown({
  title,
  rows,
  currency,
  tone,
  href,
}: {
  title: string;
  rows: { key: string; name: string; value: string; detail?: string }[];
  currency: string;
  tone: "income" | "expenses";
  href: string;
}) {
  // Floating point is used only for bar widths; displayed amounts remain exact decimal strings.
  const largest = Math.max(...rows.map((row) => Math.abs(Number(row.value))), 1);
  return (
    <section className="card min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Link href={href} className="text-sm text-blue-400 hover:underline">
          View records →
        </Link>
      </div>
      {rows.length ? (
        <ul className="max-h-96 space-y-4 overflow-y-auto pr-1">
          {rows.map((row) => (
            <li key={row.key} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium [overflow-wrap:anywhere]">{row.name}</p>
                  {row.detail && <p className="text-xs text-gray-400">{row.detail}</p>}
                </div>
                <span
                  className={`shrink-0 tabular-nums ${row.value.startsWith("-") ? "text-emerald-400" : ""}`}
                >
                  {displayAmount(row.value, currency).replace(/^\+/, "")}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/5">
                <div
                  className={`h-full rounded-full ${tone === "income" || row.value.startsWith("-") ? "bg-emerald-500/70" : "bg-rose-500/70"}`}
                  style={{
                    width: `${Math.min(100, (Math.abs(Number(row.value)) / largest) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-12 text-center text-sm text-gray-400">
          No {tone === "income" ? "income" : "expenses"} in this period.
        </p>
      )}
    </section>
  );
}
