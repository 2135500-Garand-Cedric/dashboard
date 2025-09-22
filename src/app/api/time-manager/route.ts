import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.TIME_MANAGER_API_KEY;
  const res = await fetch(
    `https://time-management.cedricgarand.com/api/time-manager?token=${token}`
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }

  const data = await res.json();

  // Remove the last activity (the ongoing one without end_time)
  const cleaned = data.filter((r: any) => r.end_time !== null && r.duration_seconds !== null);

  return NextResponse.json(cleaned);
}
