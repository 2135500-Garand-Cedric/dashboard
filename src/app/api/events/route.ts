export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const events = await prisma.event.findMany({
    orderBy: { date: "asc" },
    include: { linkedTodo: true },
  });
  return NextResponse.json(events);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { title, description, date, type } = body;

  const created = await prisma.event.create({
    data: {
      title,
      description,
      date: date ? new Date(date) : null, // ✅ allow null
      type,
    },
    include: { linkedTodo: true },
  });

  return NextResponse.json(created, { status: 201 });
}
