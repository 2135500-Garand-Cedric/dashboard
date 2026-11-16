import { CalendarDaysIcon, FlagIcon, TagIcon } from "@heroicons/react/24/outline";
import { writtenEventDate } from "@/lib/work-management/event-display";
import type { WorkProject } from "@/lib/work-management/types";

export default function ProjectSchedule({ project }: { project: WorkProject }) {
  return (
    <section aria-label="Project dates and activity type" className="grid gap-3 sm:grid-cols-3">
      {[
        {
          label: "Start date",
          value: project.startDate,
          Icon: CalendarDaysIcon,
          accent: "text-emerald-600 dark:text-emerald-400",
        },
        {
          label: "Target date",
          value: project.targetDate,
          Icon: FlagIcon,
          accent: "text-amber-600 dark:text-amber-400",
        },
      ].map(({ label, value, Icon, accent }) => (
        <div
          key={label}
          className="min-w-0 rounded-xl border border-card-border bg-background/40 p-4"
        >
          <h2 className={`mb-3 flex items-center gap-2 text-sm font-medium ${accent}`}>
            <Icon className="h-4 w-4" />
            {label}
          </h2>
          {value ? (
            <>
              <time dateTime={value} className="block break-words text-xl font-semibold">
                {writtenEventDate(value, "UTC", true)}
              </time>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(
                  new Date(`${value}T12:00:00Z`),
                )}
              </p>
            </>
          ) : (
            <p className="text-xl font-semibold text-gray-500 dark:text-gray-400">Not set</p>
          )}
        </div>
      ))}
      <div
        className="min-w-0 rounded-xl border border-card-border border-l-4 p-4"
        style={{
          borderLeftColor: project.activityType?.color || "var(--card-border)",
          backgroundColor: project.activityType ? `${project.activityType.color}0c` : undefined,
        }}
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <TagIcon className="h-4 w-4" />
          Activity type
        </h2>
        <p className="flex items-center gap-2 break-words text-xl font-semibold">
          {project.activityType && (
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: project.activityType.color }}
            />
          )}
          {project.activityType?.name || "No activity type"}
        </p>
      </div>
    </section>
  );
}
