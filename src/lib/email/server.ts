import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OWNER_DATABASE_USER_ID as userId } from "@/lib/owner-policy";
import { readUserSettings } from "@/lib/user-settings";
import { runInTimeZone } from "@/lib/time-zone-context";
import { weeklyPeriod, WeeklyInputError } from "@/lib/weekly-report/period";
import { weeklyReport } from "@/lib/weekly-report/server";
import { renderWeeklyReportPdf } from "@/lib/weekly-report/pdf.mjs";
import { latestWeeklyReportSource } from "@/lib/notifications/weekly-report.mjs";
import { dateOnlyInstant } from "@/lib/notifications/rules.mjs";
import { EmailError, emailConfiguration } from "./resend.mjs";
import { enqueueEmail, deliverEmails } from "./queue.mjs";

const headers = { "Cache-Control": "private, no-store" };
type Payload = { week: string; timeZone: string };

// Register future application emails here. The API accepts template data, never
// arbitrary recipients, HTML, file paths or credentials supplied by a browser.
const templates = {
  "weekly-report": {
    async request(data: unknown) {
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        Object.keys(data).some((key) => key !== "week")
      )
        throw new EmailError("EMAIL_JOB_INVALID");
      const { week } = data as { week?: unknown };
      if (week !== undefined && typeof week !== "string") throw new EmailError("EMAIL_JOB_INVALID");
      const { timeZone } = await readUserSettings();
      const p = weeklyPeriod(new URLSearchParams(week ? { week } : {}), timeZone);
      return { key: `weekly-report:${p.week}`, payload: { week: p.week, timeZone } };
    },
    async prepare(payload: Payload, config: NonNullable<ReturnType<typeof emailConfiguration>>) {
      if (process.env.WEEKLY_REPORT_EMAIL_ENABLED !== "true")
        throw new EmailError("EMAIL_TEMPLATE_DISABLED");
      const report = await runInTimeZone(payload.timeZone, () =>
        weeklyReport(
          new URLSearchParams({
            week: payload.week,
            currency: "CAD",
            dataset: "all",
          }),
        ),
      );
      const pdf = await renderWeeklyReportPdf(report);
      const range = `${report.period.week} to ${report.period.lastDay}`;
      const url = new URL(`/weekly-report?week=${report.period.week}`, process.env.NEXTAUTH_URL)
        .href;
      return {
        from: config.from,
        to: config.to,
        subject: `Your weekly report: ${range}`,
        text: `Your completed-week summary is attached as a one-page PDF.\n\n${range}\nOpen your dashboard: ${url}`,
        attachments: [
          {
            filename: `weekly-report-${report.period.week}.pdf`,
            content: pdf.toString("base64"),
            content_type: "application/pdf",
          },
        ],
      };
    },
  },
};

export function emailResponseError(error: unknown) {
  const invalid =
    error instanceof SyntaxError ||
    error instanceof WeeklyInputError ||
    (error instanceof EmailError && error.code === "EMAIL_JOB_INVALID");
  return NextResponse.json(
    {
      error: invalid
        ? "Choose a valid email template and data."
        : "Email is unavailable. Check the email configuration and delivery status.",
    },
    { status: invalid ? 400 : 503, headers },
  );
}

export async function queueRequestedEmail(value: unknown) {
  if (!emailConfiguration()) throw new EmailError("EMAIL_DISABLED");
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["kind", "data"].includes(key))
  )
    throw new EmailError("EMAIL_JOB_INVALID");
  const { kind, data } = value as { kind?: string; data?: unknown };
  if (!kind || !Object.hasOwn(templates, kind)) throw new EmailError("EMAIL_JOB_INVALID");
  const template = templates[kind as keyof typeof templates];
  if (kind === "weekly-report" && process.env.WEEKLY_REPORT_EMAIL_ENABLED !== "true")
    throw new EmailError("EMAIL_TEMPLATE_DISABLED");
  const request = await template.request(data ?? {});
  const job = await enqueueEmail(prisma, userId, { kind, ...request });
  return NextResponse.json({ id: job.id, status: job.status }, { status: 202, headers });
}

export async function emailDeliveryStatus() {
  const items = await prisma.emailDelivery.findMany({
    where: { userId },
    select: {
      id: true,
      kind: true,
      status: true,
      errorCode: true,
      attempts: true,
      createdAt: true,
      sentAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
  });
  return NextResponse.json({ items }, { headers });
}

export async function processEmailQueue(now = new Date()) {
  const config = emailConfiguration();
  if (!config) return NextResponse.json({ sent: 0, disabled: true }, { headers });
  if (process.env.WEEKLY_REPORT_EMAIL_ENABLED === "true") {
    const { timeZone } = await readUserSettings();
    const settings = await prisma.notificationSettings.findUnique({
      where: { userId },
      select: { dateOnlyTime: true },
    });
    const source = latestWeeklyReportSource(timeZone, now);
    const due = source && dateOnlyInstant(source.date, settings?.dateOnlyTime || "09:00", timeZone);
    if (source && due && due <= now) {
      const week = source.url.split("week=")[1];
      await enqueueEmail(
        prisma,
        userId,
        { kind: "weekly-report", key: `weekly-report:${week}`, payload: { week, timeZone } },
        now,
      );
    }
  }
  const result = await deliverEmails(prisma, {
    userId,
    config,
    now,
    prepare: async (job: { kind: string; payload: Payload }, savedConfig: typeof config) => {
      if (!Object.hasOwn(templates, job.kind)) throw new EmailError("EMAIL_TEMPLATE_UNKNOWN");
      return templates[job.kind as keyof typeof templates].prepare(job.payload, savedConfig);
    },
    allowed: (job: { kind: string }) =>
      job.kind !== "weekly-report" || process.env.WEEKLY_REPORT_EMAIL_ENABLED === "true",
  });
  return NextResponse.json(result, { headers });
}
