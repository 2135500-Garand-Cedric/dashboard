import Link from "next/link";
import {
  GlobeAltIcon,
  CalendarDaysIcon,
  BellIcon,
  BanknotesIcon,
  CakeIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
const sections = [
  {
    href: "/settings/timezone",
    title: "Display timezone",
    icon: GlobeAltIcon,
    tone: "text-sky-400 bg-sky-500/10",
  },
  {
    href: "/settings/holidays",
    title: "Calendar holidays",
    icon: CalendarDaysIcon,
    tone: "text-teal-400 bg-teal-500/10",
  },
  {
    href: "/settings/birthdays",
    title: "Birthdays",
    icon: CakeIcon,
    tone: "text-pink-400 bg-pink-500/10",
  },
  {
    href: "/settings/notifications",
    title: "Notifications",
    icon: BellIcon,
    tone: "text-amber-400 bg-amber-500/10",
  },
  {
    href: "/finance/settings",
    title: "Finance settings",
    icon: BanknotesIcon,
    tone: "text-emerald-400 bg-emerald-500/10",
  },
];
export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-8 pt-12 md:pt-2">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {sections.map(({ href, title, icon: Icon, tone }) => (
          <Link
            key={href}
            href={href}
            className="card flex min-w-0 items-center gap-4 transition-colors hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <span className={`rounded-xl p-3 ${tone}`}>
              <Icon className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 font-semibold">{title}</span>
            <ArrowRightIcon className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
