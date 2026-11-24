import { requireOwner } from "@/lib/require-owner";
import { withUserTimeZone } from "@/lib/user-settings";
import { weeklyReport } from "@/lib/weekly-report/server";
import { WeeklyInputError } from "@/lib/weekly-report/period";
import { renderWeeklyReportPdf } from "@/lib/weekly-report/pdf.mjs";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;
  try {
    return await withUserTimeZone(async () => {
      const week = new URL(request.url).searchParams.get("week");
      const report = await weeklyReport(
        new URLSearchParams({ ...(week ? { week } : {}), currency: "CAD", dataset: "all" }),
      );
      const pdf = await renderWeeklyReportPdf(report);
      return new Response(Uint8Array.from(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="weekly-report-${report.period.week}.pdf"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof WeeklyInputError
            ? error.message
            : "Unable to create the complete weekly PDF. Try again.",
      },
      {
        status: error instanceof WeeklyInputError ? 400 : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
