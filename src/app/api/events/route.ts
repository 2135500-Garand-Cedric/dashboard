import { requireOwner } from "@/lib/require-owner";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEventDates } from "@/lib/event-dates";

export async function GET() {
  const accessError = await requireOwner();
  if (accessError) return accessError;

  const events = await prisma.event.findMany({
    orderBy: { date: "asc" },
    include: { linkedTodo: true },
  });
  return NextResponse.json(events);
}

export async function POST(request: Request) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;

  const body = await request.json();
  const { title, description, date, endDate, type } = body;
  const error = validateEventDates(date, endDate);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const created = await prisma.event.create({
    data: {
      title,
      description,
      date: date ? new Date(date) : null, 
      endDate: endDate ? new Date(endDate) : null,
      type,
      user: { connect: { id: 1 } }, 
    },
    include: { linkedTodo: true },
  });

  return NextResponse.json(created, { status: 201 });
}
