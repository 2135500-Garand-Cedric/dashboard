"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FinanceNavigation() {
  const pathname = usePathname();
  const settingsPage =
    pathname === "/finance/settings" || pathname.startsWith("/finance/settings/");
  const isActive = (href: string) =>
    href === "/finance/settings"
      ? settingsPage
      : !settingsPage &&
        (pathname === href || (href !== "/finance" && pathname.startsWith(`${href}/`)));
  return (
    <nav
      aria-label="Finance navigation"
      className="grid min-w-0 grid-cols-3 gap-2 border-b border-card-border pb-4 md:flex md:flex-wrap"
    >
      {[
        { href: "/finance", label: "Overview" },
        { href: "/finance/income", label: "Income" },
        { href: "/finance/expenses", label: "Expenses" },
        { href: "/finance/transfers", label: "Transfers" },
        { href: "/finance/imports", label: "Imports" },
        { href: "/finance/settings", label: "Settings" },
      ].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-2 py-2 text-sm font-medium transition-colors md:px-4 ${isActive(item.href) ? "border-blue-500 bg-blue-600 text-white" : "border-card-border hover:bg-blue-500/10"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
