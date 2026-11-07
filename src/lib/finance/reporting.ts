import { CURRENCIES, FinanceValidationError, financeId } from "./validation";
import { calendarDate } from "./transactions";

export interface ReportFilters { mode: "month" | "year" | "custom"; from: string; to: string; currency: string; accountId: number | null; categoryId: number | null; dataset: "all" | "personal" | "examples"; }
export interface ReportTransaction { id: number; accountId: number; categoryId: number | null; date: string; amount: string; excludedAmount: string; currency: string; type: string; source: string; statementBacked: boolean; description: string; counterparty: string | null; }
export interface ReportReceipt { id: number; accountId: number | null; categoryId: number | null; date: string; total: string; currency: string; merchant: string | null; transactionId: number | null; }
export interface ReportIncome { id: number; accountId: number | null; categoryId: number | null; sourceId: number | null; date: string; gross: string | null; net: string; deductions: string; currency: string; transactionId: number | null; description: string; }
export interface ReportMatch { kind: string; receiptId: number | null; incomeRecordId: number | null; sourceTransactionId: number | null; transactionId: number | null; amount: string; status: string; }
export interface ReportData {
  accounts: { id: number; name: string; type: string; currency: string; active: boolean }[];
  categories: { id: number; name: string; type: string; active: boolean }[];
  sources: { id: number; name: string; kind: string }[];
  transactions: ReportTransaction[]; receipts: ReportReceipt[]; income: ReportIncome[]; matches: ReportMatch[];
  examples: { accountIds: number[]; receiptIds: number[]; incomeIds: number[] };
}
export interface ReportTotals { income: string; purchases: string; refunds: string; expenses: string; adjustments: string; net: string; transfersIn: string; transfersOut: string; excludedDuplicates: string; count: number; }
export interface ReportBucket extends ReportTotals { key: string; }
export interface ReportGroup { key: string; name: string; purchases: string; refunds: string; net: string; }
const ZERO = BigInt(0), SCALE = BigInt(10000);
export function moneyUnits(value: string) {
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(value)) throw new Error("Invalid stored money.");
  const negative = value.startsWith("-"), [integer, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const units = BigInt(integer) * SCALE + BigInt(fraction.padEnd(4, "0")); return negative ? -units : units;
}
export function moneyText(value: bigint) { const digits = (value < ZERO ? -value : value).toString().padStart(5, "0"); return `${value < ZERO ? "-" : ""}${digits.slice(0, -4)}.${digits.slice(-4)}`; }
const abs = (value: bigint) => value < ZERO ? -value : value;
const min = (a: bigint, b: bigint) => a < b ? a : b;
export function countedUnits(row: ReportTransaction) { const value = moneyUnits(row.amount), excluded = moneyUnits(row.excludedAmount); if (excluded < ZERO || excluded > abs(value)) throw new Error("Invalid stored exclusion."); return value < ZERO ? value + excluded : value - excluded; }
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
export function reportingToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function monthStart(value: string, offset = 0) { const [year, month] = value.split("-").map(Number); const date = day(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`); date.setUTCMonth(date.getUTCMonth() + offset); return iso(date); }
function monthEnd(value: string) { const date = day(monthStart(value, 1)); date.setUTCDate(0); return iso(date); }
export function reportFilters(params: URLSearchParams, today = reportingToday()): ReportFilters {
  const mode = params.get("mode") ?? "month", currency = params.get("currency") ?? "CAD", dataset = params.get("dataset") ?? "all";
  if (!["month", "year", "custom"].includes(mode) || !CURRENCIES.includes(currency) || !["all", "personal", "examples"].includes(dataset)) throw new FinanceValidationError("Choose valid report period, currency and data filters.");
  let from: string, to: string;
  if (mode === "month") { const month = params.get("month") ?? today.slice(0, 7); if (!/^\d{4}-\d{2}$/.test(month)) throw new FinanceValidationError("Choose a valid month."); from = calendarDate(`${month}-01`); to = monthEnd(from); }
  else if (mode === "year") { const year = params.get("year") ?? today.slice(0, 4); if (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 9998) throw new FinanceValidationError("Choose a year from 1900 to 9998."); from = `${year}-01-01`; to = `${year}-12-31`; }
  else { from = calendarDate(params.get("from"), "Start date"); to = calendarDate(params.get("to"), "End date"); }
  if (from < "1900-01-01" || to > "9998-12-31" || from > to || day(to).getTime() - day(from).getTime() > 7320 * 86400000) throw new FinanceValidationError("Choose an ordered date range of at most 20 years, between 1900 and 9998.");
  return { mode: mode as ReportFilters["mode"], from, to, currency, dataset: dataset as ReportFilters["dataset"], accountId: params.get("account") ? financeId(params.get("account")!) : null, categoryId: params.get("category") ? financeId(params.get("category")!) : null };
}
function previousRange(filters: ReportFilters) {
  if (filters.mode === "month") { const from = monthStart(filters.from, -1); return { from, to: monthEnd(from) }; }
  if (filters.mode === "year") { const year = Number(filters.from.slice(0, 4)) - 1; return { from: `${year}-01-01`, to: `${year}-12-31` }; }
  const duration = day(filters.to).getTime() - day(filters.from).getTime() + 86400000; return { from: iso(new Date(day(filters.from).getTime() - duration)), to: iso(new Date(day(filters.from).getTime() - 86400000)) };
}
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
function summarize(rows: ReportTransaction[]): ReportTotals {
  let income = ZERO, purchases = ZERO, refunds = ZERO, adjustments = ZERO, transfersIn = ZERO, transfersOut = ZERO, excluded = ZERO, count = 0;
  for (const row of rows) {
    const amount = countedUnits(row); excluded += moneyUnits(row.excludedAmount); if (amount === ZERO) continue; count++;
    if (row.type === "INCOME") income += amount;
    else if (row.type === "EXPENSE") purchases -= amount;
    else if (row.type === "REFUND") refunds += amount;
    else if (row.type === "ADJUSTMENT") adjustments += amount;
    else if (row.type === "TRANSFER") { if (amount > ZERO) transfersIn += amount; else transfersOut -= amount; }
  }
  return { income: moneyText(income), purchases: moneyText(purchases), refunds: moneyText(refunds), expenses: moneyText(purchases - refunds), adjustments: moneyText(adjustments), net: moneyText(income - purchases + refunds + adjustments), transfersIn: moneyText(transfersIn), transfersOut: moneyText(transfersOut), excludedDuplicates: moneyText(excluded), count };
}
function buckets(rows: ReportTransaction[], from: string, to: string, interval: "day" | "month" | "year"): ReportBucket[] {
  const grouped = new Map<string, ReportTransaction[]>(), key = (date: string) => date.slice(0, interval === "day" ? 10 : interval === "month" ? 7 : 4);
  for (const row of rows) if (inRange(row.date, from, to)) { const group = key(row.date); grouped.set(group, [...(grouped.get(group) ?? []), row]); }
  const result: ReportBucket[] = [], cursor = day(interval === "day" ? from : interval === "month" ? `${from.slice(0, 7)}-01` : `${from.slice(0, 4)}-01-01`);
  while (iso(cursor) <= to) { const value = key(iso(cursor)); result.push({ key: value, ...summarize(grouped.get(value) ?? []) }); if (interval === "day") cursor.setUTCDate(cursor.getUTCDate() + 1); else if (interval === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1); else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1); }
  return result;
}
function spending(rows: ReportTransaction[], keyFor: (row: ReportTransaction) => [string, string]): ReportGroup[] {
  const groups = new Map<string, { name: string; purchases: bigint; refunds: bigint }>();
  for (const row of rows) { const amount = countedUnits(row); if (amount === ZERO || !["EXPENSE", "REFUND"].includes(row.type)) continue; const [key, name] = keyFor(row), group = groups.get(key) ?? { name, purchases: ZERO, refunds: ZERO }; if (row.type === "REFUND") group.refunds += amount; else group.purchases -= amount; groups.set(key, group); }
  return [...groups].map(([key, row]) => ({ key, name: row.name, purchases: moneyText(row.purchases), refunds: moneyText(row.refunds), net: moneyText(row.purchases - row.refunds) })).sort((a, b) => { const left = abs(moneyUnits(a.net)), right = abs(moneyUnits(b.net)); return left === right ? a.name.localeCompare(b.name) : left > right ? -1 : 1; });
}
export function buildReport(data: ReportData, filters: ReportFilters, today = reportingToday()) {
  const exampleAccounts = new Set(data.examples.accountIds), exampleReceipts = new Set(data.examples.receiptIds), exampleIncome = new Set(data.examples.incomeIds);
  const includeDataset = (example: boolean) => filters.dataset === "all" || (filters.dataset === "examples") === example;
  const accountMap = new Map(data.accounts.map(row => [row.id, row])), categoryMap = new Map(data.categories.map(row => [row.id, row])), incomeMap = new Map(data.income.map(row => [row.id, row]));
  const confirmed = data.matches.filter(row => row.status === "CONFIRMED"), txMap = new Map(data.transactions.map(row => [row.id, row]));
  if (filters.accountId && !accountMap.has(filters.accountId) || filters.categoryId && !categoryMap.has(filters.categoryId)) throw new FinanceValidationError("Choose report accounts and categories belonging to you.");
  if (filters.accountId && accountMap.get(filters.accountId)!.currency !== filters.currency) throw new FinanceValidationError("Choose the selected account's currency.");
  const scoped = data.transactions.filter(row => row.currency === filters.currency && (!filters.accountId || row.accountId === filters.accountId) && (!filters.categoryId || row.categoryId === filters.categoryId) && includeDataset(exampleAccounts.has(row.accountId)));
  const selected = scoped.filter(row => inRange(row.date, filters.from, filters.to)), active = selected.filter(row => countedUnits(row) !== ZERO);
  const previous = previousRange(filters), totals = summarize(selected), previousTotals = summarize(scoped.filter(row => inRange(row.date, previous.from, previous.to)));
  const coverage = (id: number, kind: "RECEIPT" | "INCOME") => {
    let amount = ZERO;
    for (const link of confirmed) if (link.kind === kind && link.transactionId === id) amount += moneyUnits(link.amount);
    // Compatibility for pre-existing direct associations without a migrated allocation row.
    if (kind === "RECEIPT") for (const record of data.receipts) if (record.transactionId === id && !confirmed.some(link => link.kind === kind && link.receiptId === record.id)) amount += moneyUnits(record.total);
    if (kind === "INCOME") for (const record of data.income) if (record.transactionId === id && !confirmed.some(link => link.kind === kind && link.incomeRecordId === record.id)) amount += moneyUnits(record.net);
    return amount;
  };
  const supported = (row: ReportTransaction) => {
    const kind = row.type === "INCOME" ? "INCOME" as const : "RECEIPT" as const; let amount = coverage(row.id, kind);
    for (const link of confirmed) if (link.kind === "DUPLICATE" && link.transactionId === row.id && link.sourceTransactionId) { const manual = txMap.get(link.sourceTransactionId); if (manual && coverage(manual.id, kind) >= abs(moneyUnits(manual.amount))) amount += moneyUnits(link.amount); }
    return min(amount, abs(countedUnits(row)));
  };
  const unmatchedTransactions = active.filter(row => ["EXPENSE", "INCOME"].includes(row.type) && supported(row) < abs(countedUnits(row))).map(row => ({ id: row.id, description: row.description, date: row.date, type: row.type, account: accountMap.get(row.accountId)!.name, amount: moneyText(countedUnits(row)), remaining: moneyText(abs(countedUnits(row)) - supported(row)) }));
  const receiptScope = data.receipts.filter(row => row.currency === filters.currency && (!filters.accountId || row.accountId === filters.accountId) && (!filters.categoryId || row.categoryId === filters.categoryId) && includeDataset(exampleAccounts.has(row.accountId ?? 0) || exampleReceipts.has(row.id)) && inRange(row.date, filters.from, filters.to));
  const unmatchedReceipts = receiptScope.flatMap(row => {
    const links = confirmed.filter(link => link.kind === "RECEIPT" && link.receiptId === row.id), used = links.length ? links.reduce((total, link) => total + moneyUnits(link.amount), ZERO) : row.transactionId ? moneyUnits(row.total) : ZERO, left = moneyUnits(row.total) - used;
    return left > ZERO ? [{ id: row.id, merchant: row.merchant ?? "Receipt", date: row.date, remaining: moneyText(left) }] : [];
  });
  const payRecords = data.income.filter(row => row.currency === filters.currency && (!filters.accountId || row.accountId === filters.accountId) && (!filters.categoryId || row.categoryId === filters.categoryId) && includeDataset(exampleAccounts.has(row.accountId ?? 0) || exampleIncome.has(row.id)) && inRange(row.date, filters.from, filters.to));
  const earnings = { records: payRecords.length, gross: moneyText(payRecords.reduce((sum, row) => sum + (row.gross === null ? ZERO : moneyUnits(row.gross)), ZERO)), missingGross: payRecords.filter(row => row.gross === null).length, net: moneyText(payRecords.reduce((sum, row) => sum + moneyUnits(row.net), ZERO)), deductions: moneyText(payRecords.reduce((sum, row) => sum + moneyUnits(row.deductions), ZERO)) };
  // Attribute deposits through confirmed net-pay allocations. Partial duplicate shares use
  // exact integer prorating; any sub-unit remainder stays explicitly unattributed.
  const sourceGroups = new Map<string, { name: string; amount: bigint }>(), sourceNames = new Map(data.sources.map(row => [row.id, row.name])); let overlappingIncome = 0;
  const addSource = (key: string, name: string, amount: bigint) => { const group = sourceGroups.get(key) ?? { name, amount: ZERO }; group.amount += amount; sourceGroups.set(key, group); };
  const allocations = (id: number) => {
    const result = confirmed.filter(link => link.kind === "INCOME" && link.transactionId === id && link.incomeRecordId && incomeMap.has(link.incomeRecordId)).map(link => ({ record: incomeMap.get(link.incomeRecordId!)!, amount: moneyUnits(link.amount) }));
    for (const record of data.income) if (record.transactionId === id && !confirmed.some(link => link.kind === "INCOME" && link.incomeRecordId === record.id)) result.push({ record, amount: moneyUnits(record.net) });
    return result;
  };
  for (const row of active.filter(row => row.type === "INCOME")) {
    const counted = countedUnits(row), original = abs(moneyUnits(row.amount)), attributed = new Map<string, bigint>(); let conflict = false;
    const assign = (id: number, share: bigint) => { const originalRow = txMap.get(id); if (!originalRow) return; const amount = abs(moneyUnits(originalRow.amount)), links = allocations(id); if (!amount || links.reduce((sum, link) => sum + link.amount, ZERO) > amount) { conflict = true; return; } for (const link of links) { const key = link.record.sourceId === null ? "unspecified" : String(link.record.sourceId); attributed.set(key, (attributed.get(key) ?? ZERO) + link.amount * share / amount); } };
    if (original > ZERO) assign(row.id, counted);
    for (const link of confirmed) if (link.kind === "DUPLICATE" && link.transactionId === row.id && link.sourceTransactionId) assign(link.sourceTransactionId, moneyUnits(link.amount));
    const used = [...attributed.values()].reduce((a, b) => a + b, ZERO);
    if (conflict || used > counted) { overlappingIncome++; addSource("overlap", "Overlapping source matches — review", counted); }
    else { for (const [key, amount] of attributed) if (amount) addSource(key, key === "unspecified" ? "Source not specified" : sourceNames.get(Number(key)) ?? "Source not specified", amount); if (used < counted) addSource("unattributed", "Unattributed deposits", counted - used); }
  }
  const sourceBreakdown = [...sourceGroups].map(([key, row]) => ({ key, name: row.name, amount: moneyText(row.amount) }));
  const unresolvedDuplicates = active.filter(row => row.source === "MANUAL" && !row.statementBacked && !(row.type === "TRANSFER" && moneyUnits(row.amount) > ZERO) && data.transactions.some(target => target.id !== row.id && target.statementBacked && target.currency === row.currency && target.accountId === row.accountId && target.type === row.type && countedUnits(target) !== ZERO && Math.abs(day(row.date).getTime() - day(target.date).getTime()) <= 60 * 86400000 && moneyUnits(row.amount) === moneyUnits(target.amount) && !data.matches.some(link => link.kind === "DUPLICATE" && link.sourceTransactionId === row.id && link.transactionId === target.id && ["CONFIRMED", "REJECTED"].includes(link.status)))).length;
  const interval = filters.mode === "month" || day(filters.to).getTime() - day(filters.from).getTime() <= 62 * 86400000 ? "day" : filters.mode === "year" || day(filters.to).getTime() - day(filters.from).getTime() <= 731 * 86400000 ? "month" : "year";
  const monthlyFrom = monthStart(filters.to, -11), yearlyFrom = `${Number(filters.to.slice(0, 4)) - 4}-01-01`;
  const spendingByCategory = spending(selected, row => [String(row.categoryId ?? "none"), categoryMap.get(row.categoryId ?? 0)?.name ?? "Uncategorized"]), spendingByMerchant = spending(selected, row => { const name = row.counterparty?.trim() || "Merchant not specified"; return [name.normalize("NFKC").toLocaleLowerCase("en-CA"), name]; }), spendingByAccount = spending(selected, row => [String(row.accountId), accountMap.get(row.accountId)!.name]);
  const coverageAccounts = data.accounts.filter(row => row.currency === filters.currency && (!filters.accountId || row.id === filters.accountId) && includeDataset(exampleAccounts.has(row.id))).map(account => { const rows = selected.filter(row => row.accountId === account.id && countedUnits(row) !== ZERO), dates = rows.map(row => row.date).sort(); return { ...account, count: rows.length, first: dates[0] ?? null, last: dates.at(-1) ?? null, statementBacked: rows.filter(row => row.statementBacked).length }; });
  return { filters, totals, previous: { ...previous, totals: previousTotals, change: { income: moneyText(moneyUnits(totals.income) - moneyUnits(previousTotals.income)), expenses: moneyText(moneyUnits(totals.expenses) - moneyUnits(previousTotals.expenses)), net: moneyText(moneyUnits(totals.net) - moneyUnits(previousTotals.net)) } }, interval, timeline: buckets(scoped, filters.from, filters.to, interval), monthlyTrend: buckets(scoped, monthlyFrom, filters.to, "month"), yearlyTrend: buckets(scoped, yearlyFrom, filters.to, "year"), spendingByCategory, spendingByMerchant, spendingByAccount, incomeBySource: sourceBreakdown, earnings, recent: active.filter(row => row.type !== "TRANSFER" || moneyUnits(row.amount) < ZERO || !!filters.accountId).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 10).map(row => ({ id: row.id, date: row.date, description: row.description, type: row.type, account: accountMap.get(row.accountId)!.name, amount: moneyText(countedUnits(row)) })), unmatched: { transactions: unmatchedTransactions.slice(0, 8), transactionCount: unmatchedTransactions.length, receipts: unmatchedReceipts.slice(0, 8), receiptCount: unmatchedReceipts.length }, coverage: { accounts: coverageAccounts, examplesIncluded: scoped.some(row => exampleAccounts.has(row.accountId)) && filters.dataset !== "personal", hasExamples: data.examples.accountIds.length > 0, currencies: [...new Set(data.accounts.map(row => row.currency))].sort(), otherCurrencyAccounts: data.accounts.filter(row => row.currency !== filters.currency).length, unresolvedDuplicates, overlappingIncome, futureDated: active.filter(row => row.date > today).length, inProgress: filters.to > today, earliest: scoped.map(row => row.date).sort()[0] ?? null, latest: scoped.map(row => row.date).sort().at(-1) ?? null } };
}
export type FinanceReport = ReturnType<typeof buildReport>;
