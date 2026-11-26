"use client";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ArrowsRightLeftIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AdjustmentsHorizontalIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline";
import { currencyOptionLabel, CURRENCIES, type FinanceAccount } from "@/lib/finance/validation";
import type { FinanceOverviewReport } from "@/lib/finance/overview";
import { INCOME_KINDS, type IncomeKind } from "@/lib/finance/income";
import { displayAmount } from "@/lib/finance/transactions";
import { FinanceTimeline } from "./FinanceReportCharts";
import OverviewBreakdown from "./OverviewBreakdown";
import OverviewMatching from "./OverviewMatching";
import OverviewRecent from "./OverviewRecent";
import AccountBalances from "./AccountBalances";
import { useHistoryFilters } from "./useHistoryFilters";
import {
  fieldClass,
  FinanceLoadError,
  primaryButton,
  secondaryButton,
  useFinanceData,
} from "./shared";

const money = (value: string, currency: string) =>
  displayAmount(value, currency).replace(/^\+/, "");
const writtenDate = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
function historyLink(view: string, report: FinanceOverviewReport) {
  const params = new URLSearchParams({
    from: report.filters.from,
    to: report.filters.to,
    currency: report.filters.currency,
  });
  if (report.filters.accountId) params.set("account", String(report.filters.accountId));
  return `/finance/${view}?${params}`;
}

export default function FinanceOverview({ today }: { today: string }) {
  const initial = useMemo(
    () => ({
      mode: "month",
      month: today.slice(0, 7),
      year: today.slice(0, 4),
      from: `${today.slice(0, 7)}-01`,
      to: today,
      currency: "CAD",
      account: "",
      dataset: "all",
    }),
    [today],
  );
  const { draft, setDraft, filters, setFilters, filtersOpen, setFiltersOpen } =
    useHistoryFilters(initial);
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const result = useFinanceData<FinanceOverviewReport>(
    `/api/finance/reports?${new URLSearchParams(filters)}`,
  );
  const currencies = CURRENCIES;
  function update(patch: Partial<typeof initial>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setFilters({ ...filters, ...patch });
  }
  function movePeriod(offset: number) {
    if (filters.mode === "month") {
      const date = new Date(`${filters.month}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + offset);
      update({ month: date.toISOString().slice(0, 7) });
    } else update({ year: String(Number(filters.year) + offset) });
  }
  function applyCustom(event: FormEvent) {
    event.preventDefault();
    setFilters({ ...draft });
  }
  const filterCount = Number(!!filters.account) + Number(filters.dataset !== "all");
  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Financial overview</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/finance/income/new"
            className={`${secondaryButton} gap-2 !border-emerald-500/30`}
          >
            <PlusIcon className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Add income
          </Link>
          <Link
            href="/finance/expenses/new"
            className={`${secondaryButton} gap-2 !border-rose-500/30`}
          >
            <PlusIcon className="h-4 w-4 text-rose-400" aria-hidden="true" />
            Add expense
          </Link>
        </div>
      </div>
      <section
        aria-label="Overview period and filters"
        className="rounded-xl border border-card-border bg-card-bg p-3 sm:p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex max-w-full gap-1 rounded-lg bg-background/40 p-1"
            role="group"
            aria-label="Report period"
          >
            {[
              ["month", "Month"],
              ["year", "Year"],
              ["custom", "Custom range"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filters.mode === value}
                className={`min-h-10 rounded-md px-3 text-sm font-medium ${filters.mode === value ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-foreground/5"}`}
                onClick={() => update({ mode: value })}
              >
                {label}
              </button>
            ))}
          </div>
          {filters.mode !== "custom" && (
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                aria-label="Previous period"
                disabled={
                  filters.mode === "year"
                    ? Number(filters.year) <= 1900
                    : filters.month <= "1900-01"
                }
                className={`${secondaryButton} !px-2`}
                onClick={() => movePeriod(-1)}
              >
                <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
              </button>
              {filters.mode === "month" ? (
                <input
                  aria-label="Report month"
                  type="month"
                  min="1900-01"
                  max="9998-12"
                  className={`${fieldClass} !w-44`}
                  value={draft.month}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((previous) => ({ ...previous, month: value }));
                    if (/^\d{4}-\d{2}$/.test(value)) update({ month: value });
                  }}
                />
              ) : (
                <input
                  aria-label="Report year"
                  type="number"
                  min={1900}
                  max={9998}
                  className={`${fieldClass} !w-28`}
                  value={draft.year}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((previous) => ({ ...previous, year: value }));
                    if (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 9998)
                      update({ year: value });
                  }}
                />
              )}
              <button
                type="button"
                aria-label="Next period"
                disabled={
                  filters.mode === "year"
                    ? Number(filters.year) >= 9998
                    : filters.month >= "9998-12"
                }
                className={`${secondaryButton} !px-2`}
                onClick={() => movePeriod(1)}
              >
                <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          <select
            aria-label="Report currency"
            className={`${fieldClass} !w-auto sm:ml-auto`}
            value={draft.currency}
            onChange={(event) => update({ currency: event.target.value, account: "" })}
          >
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currencyOptionLabel(currency)}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="overview-filters"
            className={`${secondaryButton} gap-2`}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <AdjustmentsHorizontalIcon className="h-4 w-4" aria-hidden="true" />
            Filters{filterCount ? ` (${filterCount})` : ""}
          </button>
        </div>
        {filters.mode === "custom" && (
          <form
            onSubmit={applyCustom}
            className="mt-4 grid gap-3 border-t border-card-border pt-4 sm:grid-cols-[1fr_1fr_auto]"
          >
            <label className="space-y-1 text-sm">
              From
              <input
                aria-label="Report from date"
                type="date"
                required
                className={fieldClass}
                value={draft.from}
                max={draft.to || undefined}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, from: event.target.value }))
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              To
              <input
                aria-label="Report to date"
                type="date"
                required
                className={fieldClass}
                value={draft.to}
                min={draft.from || undefined}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, to: event.target.value }))
                }
              />
            </label>
            <button className={`${primaryButton} self-end`}>Apply range</button>
          </form>
        )}
        <div
          hidden={!filtersOpen}
          id="overview-filters"
          className="mt-4 grid gap-4 border-t border-card-border pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
        >
          <label className="space-y-1 text-sm">
            Account
            <select
              aria-label="Report account"
              className={fieldClass}
              value={draft.account}
              onChange={(event) => {
                const account = accounts.data?.accounts.find(
                  (row) => row.id === Number(event.target.value),
                );
                update({
                  account: event.target.value,
                  currency: account?.currency ?? filters.currency,
                });
              }}
            >
              <option value="">All accounts in {filters.currency}</option>
              {accounts.data?.accounts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.currency}
                  {row.active ? "" : " · Inactive"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Data
            <select
              aria-label="Report data"
              className={fieldClass}
              value={draft.dataset}
              onChange={(event) => update({ dataset: event.target.value })}
            >
              <option value="all">All records</option>
              <option value="personal">Personal records only</option>
              <option value="examples">Example records only</option>
            </select>
          </label>
          <button
            type="button"
            className={`${secondaryButton} self-end`}
            onClick={() => update({ account: "", dataset: "all" })}
          >
            Clear filters
          </button>
        </div>
      </section>
      {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}
      {result.error && <FinanceLoadError error={result.error} retry={result.retry} />}
      {result.loading ? (
        <div role="status" className="grid animate-pulse gap-4 sm:grid-cols-3">
          <span className="sr-only">Loading financial overview…</span>
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-40 rounded-xl border border-card-border bg-card-bg" />
          ))}
        </div>
      ) : (
        !result.error && result.data?.overview && <ReportContent report={result.data} />
      )}
    </div>
  );
}

function ReportContent({ report }: { report: FinanceOverviewReport }) {
  const [spendingView, setSpendingView] = useState<"category" | "account">("category");
  const [trend, setTrend] = useState<"period" | "months">("period");
  const { totals, filters, previous, coverage, overview } = report;
  const currency = filters.currency;
  const incomeCount = overview.groups.find((row) => row.key === "income")?.total ?? 0;
  const expenseCount = overview.groups.find((row) => row.key === "expenses")?.total ?? 0;
  const scope =
    overview.accountCount === 1
      ? (coverage.accounts[0]?.name ?? "1 account")
      : `${overview.accountCount} accounts`;
  const comparison = `${writtenDate(previous.from)} – ${writtenDate(previous.to)}`;
  const chartRows = trend === "period" ? report.timeline : report.monthlyTrend;
  const sourceRows = report.incomeBySource
    .map((row) => ({
      key: row.key,
      name: row.name,
      value: row.amount,
      detail:
        overview.sources.find((source) => String(source.id) === row.key)?.typeName ??
        INCOME_KINDS[
          overview.sources.find((source) => String(source.id) === row.key)?.kind as IncomeKind
        ],
    }))
    .sort((a, b) => {
      const left = BigInt(a.value.replace(".", "")),
        right = BigInt(b.value.replace(".", ""));
      return left === right ? a.name.localeCompare(b.name) : left > right ? -1 : 1;
    });
  const spendingRows =
    spendingView === "category" ? report.spendingByCategory : report.spendingByAccount;
  return (
    <div className="min-w-0 space-y-5" data-finance-report>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-400">
        <p>
          {writtenDate(filters.from)} – {writtenDate(filters.to)} · {currency} · {scope}
        </p>
        <div className="flex flex-wrap gap-2">
          {coverage.inProgress && (
            <span className="rounded-full border border-card-border px-2 py-1 text-xs">
              Period in progress
            </span>
          )}
          {coverage.examplesIncluded && (
            <span className="rounded-full border border-amber-500/30 px-2 py-1 text-xs text-amber-500">
              Includes example data
            </span>
          )}
        </div>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Metric
          title="Income"
          value={totals.income}
          change={previous.change.income}
          currency={currency}
          tone="income"
          detail={`${incomeCount} income ${incomeCount === 1 ? "record" : "records"}`}
          comparison={comparison}
          inProgress={coverage.inProgress}
          href={historyLink("income", report)}
        />
        <Metric
          title="Net expenses"
          value={totals.expenses}
          change={previous.change.expenses}
          currency={currency}
          tone="expenses"
          detail={`${money(totals.purchases, currency)} purchases − ${money(totals.refunds, currency)} refunds`}
          comparison={comparison}
          inProgress={coverage.inProgress}
          href={historyLink("expenses", report)}
        />
        <Metric
          title="Net cash flow"
          value={totals.net}
          change={previous.change.net}
          currency={currency}
          tone="net"
          detail={
            totals.adjustments !== "0.0000"
              ? `Includes ${money(totals.adjustments, currency)} in adjustments`
              : "Income − net expenses"
          }
          comparison={comparison}
          inProgress={coverage.inProgress}
        />
      </div>
      {coverage.futureDated > 0 && (
        <p className="rounded-lg border border-amber-500/20 p-3 text-sm text-amber-500">
          {coverage.futureDated} future-dated records are included in this range.
        </p>
      )}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="min-w-0 space-y-5">
          <FinanceTimeline
            rows={chartRows}
            currency={currency}
            title="Income versus expenses"
            actions={
              <div className="flex gap-1 rounded-lg bg-background/40 p-1">
                {[
                  ["period", "Selected period"],
                  ["months", "12 months"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={trend === value}
                    onClick={() => setTrend(value as typeof trend)}
                    className={`min-h-9 rounded-md px-2.5 text-xs ${trend === value ? "bg-blue-600 text-white" : "text-gray-400"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />
        </div>
        <OverviewMatching report={report} />
      </div>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="flex gap-2 px-1" role="group" aria-label="Spending breakdown">
            {[
              ["category", "By category"],
              ["account", "By account"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={spendingView === value}
                className={`rounded-md px-2 py-1 text-xs ${spendingView === value ? "bg-rose-500/10 text-rose-400" : "text-gray-400"}`}
                onClick={() => setSpendingView(value as typeof spendingView)}
              >
                {label}
              </button>
            ))}
          </div>
          <OverviewBreakdown
            title={spendingView === "category" ? "Spending by category" : "Spending by account"}
            rows={spendingRows.map((row) => ({
              key: row.key,
              name: row.name,
              value: row.net,
              detail: row.net.startsWith("-") ? "Refunds exceed purchases" : undefined,
            }))}
            currency={currency}
            tone="expenses"
            href={historyLink("expenses", report)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="px-1 py-1 text-xs text-gray-400">
            {incomeCount} income records · {expenseCount} expense / refund records
          </div>
          <OverviewBreakdown
            title="Income by source"
            rows={sourceRows}
            currency={currency}
            tone="income"
            href={historyLink("income", report)}
          />
        </div>
      </div>

      {overview.awaitingReimbursements && (
        <section
          className="card grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
          aria-label="Awaiting reimbursements"
        >
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Awaiting reimbursements</h3>
            <p className="text-3xl font-semibold tabular-nums text-amber-300">
              {money(overview.awaitingReimbursements.total, currency)}
            </p>
            <p className="text-sm text-muted">
              {overview.awaitingReimbursements.count} expenses · Current as of{" "}
              {writtenDate(overview.awaitingReimbursements.asOf)}
            </p>
          </div>
          <ul className="divide-y divide-card-border">
            {overview.awaitingReimbursements.expenses.map((row) => (
              <li key={row.id} className="flex justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    className="break-words text-blue-300 hover:underline"
                    href={`/finance/expenses/${row.id}`}
                  >
                    {row.description}
                  </Link>
                  <p className="text-xs text-muted">{row.people}</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-amber-300">
                  {money(row.remaining, currency)}
                </span>
              </li>
            ))}
            {!overview.awaitingReimbursements.count && (
              <li className="py-3 text-sm text-muted">No reimbursements outstanding.</li>
            )}
          </ul>
        </section>
      )}
      <AccountBalances
        currency={currency}
        accountId={filters.accountId}
        accountIds={coverage.accounts.map((account) => account.id)}
      />
      <OverviewRecent report={report} />
      <p className="flex items-center gap-2 text-xs text-gray-500">
        <ChartBarIcon className="h-4 w-4" aria-hidden="true" />
        Recorded activity only · Transfers are separate · {currency}
      </p>
    </div>
  );
}

function Metric({
  title,
  value,
  change,
  currency,
  tone,
  detail,
  comparison,
  inProgress,
  href,
}: {
  title: string;
  value: string;
  change: string;
  currency: string;
  tone: "income" | "expenses" | "net";
  detail: string;
  comparison: string;
  inProgress: boolean;
  href?: string;
}) {
  const Icon =
    tone === "income"
      ? ArrowDownLeftIcon
      : tone === "expenses"
        ? ArrowUpRightIcon
        : ArrowsRightLeftIcon;
  const color =
    tone === "income"
      ? "text-emerald-400"
      : tone === "expenses"
        ? "text-rose-400"
        : value.startsWith("-")
          ? "text-rose-400"
          : "text-blue-400";
  const favorable = tone === "expenses" ? change.startsWith("-") : !change.startsWith("-");
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-card-border bg-card-bg p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-400">{title}</h3>
        <Icon className={`h-5 w-5 ${color}`} aria-hidden="true" />
      </div>
      <div>
        <p
          className={`break-words text-3xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] ${color}`}
          data-total={title}
        >
          {money(value, currency)}
        </p>
        <p className="mt-2 break-words text-xs text-gray-400">{detail}</p>
      </div>
      <div className="mt-auto border-t border-card-border pt-3">
        <p
          className={`text-sm tabular-nums ${inProgress ? "text-gray-300" : favorable ? "text-emerald-400" : "text-rose-400"}`}
        >
          {displayAmount(change, currency)}{" "}
          <span className="text-xs text-gray-500">
            {inProgress ? "change · period in progress" : "change"}
          </span>
        </p>
        <p className="mt-1 text-xs text-gray-500">vs {comparison}</p>
        {href && (
          <Link href={href} className="mt-3 inline-block text-sm text-blue-400 hover:underline">
            View {tone === "income" ? "income" : "expenses"} →
          </Link>
        )}
      </div>
    </section>
  );
}
