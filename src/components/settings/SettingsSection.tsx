import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
export default function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-8 pt-12 md:pt-2">
      <header className="flex flex-wrap items-center gap-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm hover:border-blue-500"
        >
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          Back to settings
        </Link>
        <h1 className="text-2xl font-bold">{title}</h1>
      </header>
      {children}
    </div>
  );
}
