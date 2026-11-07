"use client";

import Link from "next/link";
import { ACCOUNT_TYPES, type FinanceAccount, type FinanceCategory } from "@/lib/finance/validation";
import { FinanceLoadError, FinanceStatus, primaryButton, secondaryButton, useFinanceData } from "./shared";

export default function FinanceLanding() {
  const accounts = useFinanceData<{ accounts: FinanceAccount[] }>("/api/finance/accounts");
  const categories = useFinanceData<{ categories: FinanceCategory[] }>("/api/finance/categories");
  return <div className="space-y-6">
    {accounts.error && <FinanceLoadError error={accounts.error} retry={accounts.retry} />}
    {categories.error && <FinanceLoadError error={categories.error} retry={categories.retry} />}
    <section className="card flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Transactions</h2><div className="flex flex-wrap gap-2"><Link href="/finance/transactions" className={secondaryButton}>Transaction history</Link><Link href="/finance/transactions/new" className={primaryButton}>Add transaction</Link></div></section>
    <section className="card flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Receipts</h2><div className="flex flex-wrap gap-2"><Link href="/finance/receipts" className={secondaryButton}>Receipt history</Link><Link href="/finance/receipts/new" className={primaryButton}>Add receipt</Link></div></section>
    <section className="card flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Income & pay stubs</h2><div className="flex flex-wrap gap-2"><Link href="/finance/income" className={secondaryButton}>Income history</Link><Link href="/finance/income/new" className={primaryButton}>Add income</Link></div></section>
    <section className="card flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Statement imports</h2><div className="flex flex-wrap gap-2"><Link href="/finance/imports" className={secondaryButton}>Import history</Link><Link href="/finance/imports/new" className={primaryButton}>Import CSV</Link></div></section>
    <section className="card flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Reconciliation</h2><Link href="/finance/reconciliation" className={primaryButton}>Review matches & unmatched activity</Link></section>
    <div className="grid gap-5 md:grid-cols-2">
      <section className="card space-y-4"><h2 className="text-xl font-semibold">Financial accounts</h2>
        {accounts.loading ? <p role="status" className="text-gray-500">Loading accounts…</p> : accounts.data && <><p className="text-4xl font-bold">{accounts.data.accounts.length}</p><p className="text-sm text-gray-500">{accounts.data.accounts.filter(account => account.active).length} active · {accounts.data.accounts.filter(account => !account.active).length} inactive</p></>}
        <Link href="/finance/accounts" className={primaryButton}>Manage accounts →</Link>
      </section>
      <section className="card space-y-4"><h2 className="text-xl font-semibold">Income & expense categories</h2>
        {categories.loading ? <p role="status" className="text-gray-500">Loading categories…</p> : categories.data && <><p className="text-4xl font-bold">{categories.data.categories.length}</p><p className="text-sm text-gray-500">{categories.data.categories.filter(category => category.type === "EXPENSE").length} expense · {categories.data.categories.filter(category => category.type === "INCOME").length} income</p></>}
        <Link href="/finance/categories" className={secondaryButton}>Manage categories →</Link>
      </section>
    </div>
    {accounts.data && <section className="card space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Your accounts</h2>{accounts.data.accounts.length > 0 && <Link href="/finance/accounts" className={secondaryButton}>View all accounts</Link>}</div>
      {accounts.data.accounts.length ? <ul className="divide-y divide-card-border">{accounts.data.accounts.slice(0, 5).map(account => <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-words font-medium">{account.name}</p><p className="mt-1 text-sm text-gray-500">{ACCOUNT_TYPES[account.type]} · {account.currency}{account.maskedIdentifier ? ` · ${account.maskedIdentifier}` : ""}</p></div><FinanceStatus active={account.active} /></li>)}</ul> : <div className="py-6 space-y-4"><p className="text-gray-500">No financial accounts yet.</p><Link href="/finance/accounts" className={primaryButton}>Add your first account</Link></div>}
    </section>}
  </div>;
}
