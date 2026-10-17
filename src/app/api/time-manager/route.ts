import { NextResponse } from "next/server";

type TimeRecord = { end_time: string | null; duration_seconds: number | string | null };

export async function GET() {
  try {
    const token = process.env.TIME_MANAGER_API_KEY;
    if (!token) return NextResponse.json({ error: "Time Manager is not configured." }, { status: 503 });
    const url = new URL("https://time-management.cedricgarand.com/api/time-manager");
    url.searchParams.set("token", token);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "Unable to load Time Manager data." }, { status: 502 });
    const data: TimeRecord[] = await res.json();
    if (!Array.isArray(data)) return NextResponse.json({ error: "Unable to load Time Manager data." }, { status: 502 });
    return NextResponse.json(data.filter((record) => record.end_time !== null && record.duration_seconds !== null));
  } catch {
    return NextResponse.json({ error: "Time Manager is temporarily unavailable. Please try again later." }, { status: 502 });
  }
}
