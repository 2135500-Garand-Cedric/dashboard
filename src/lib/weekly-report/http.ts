import { NextResponse } from "next/server";
import { withUserTimeZone } from "@/lib/user-settings";
import { weeklyItems, weeklyReport } from "./server";
import { WeeklyInputError } from "./period";
export async function weeklyResponse(request: Request, items = false) {
  try {
    return await withUserTimeZone(async () =>
      NextResponse.json(
        await (items ? weeklyItems : weeklyReport)(new URL(request.url).searchParams),
        { headers: { "Cache-Control": "private, no-store" } },
      ),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof WeeklyInputError
            ? error.message
            : "Unable to load the weekly report. Please try again.",
      },
      {
        status: error instanceof WeeklyInputError ? 400 : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
