import Link from "next/link";
import {
  BanknotesIcon,
  TagIcon,
  BuildingOfficeIcon,
  ReceiptPercentIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

const sections = [
  {
    href: "/finance/settings/accounts",
    title: "Financial accounts",
    icon: BanknotesIcon,
    tone: "bg-blue-500/10 text-blue-400",
  },
  {
    href: "/finance/settings/categories",
    title: "Expense categories",
    icon: TagIcon,
    tone: "bg-rose-500/10 text-rose-400",
  },
  {
    href: "/finance/settings/income-sources",
    title: "Income sources",
    icon: BuildingOfficeIcon,
    tone: "bg-emerald-500/10 text-emerald-400",
  },
  {
    href: "/finance/settings/deduction-types",
    title: "Deduction types",
    icon: ReceiptPercentIcon,
    tone: "bg-amber-500/10 text-amber-400",
  },
];

export default function FinanceSettingsPage() {
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-semibold">Finance settings</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {sections.map(({ href, title, icon: Icon, tone }) => (
          <Link
            key={href}
            href={href}
            className="card flex min-w-0 items-center gap-4 transition-colors hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <span className={`rounded-xl p-3 ${tone}`}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 font-semibold">{title}</span>
            <ArrowRightIcon className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
