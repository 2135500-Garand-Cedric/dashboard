export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEventDates } from "@/lib/event-dates";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params; // ✅ await params
  const event = await prisma.event.findUnique({
    where: { id: Number(id) },
    include: { linkedTodo: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json(event);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json();
  const { title, description, date, endDate, type, linkedTodoId } = body;
  const existing = await prisma.event.findUnique({ where: { id: Number(id) } });
  if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const error = validateEventDates(
    date === undefined ? existing.date?.toISOString() ?? null : date,
    endDate === undefined ? existing.endDate?.toISOString() ?? null : endDate,
  );
  if (error) return NextResponse.json({ error }, { status: 400 });

  const updated = await prisma.event.update({
    where: { id: Number(id) },
    data: {
      title,
      description,
      date: date === undefined ? undefined : date === null ? null : new Date(date),
      endDate: endDate === undefined ? undefined : endDate === null ? null : new Date(endDate),
      type,
      linkedTodoId,
    },
    include: { linkedTodo: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  // Find the event to see if it has a linked todo
  const event = await prisma.event.findUnique({
    where: { id: Number(id) },
    include: { linkedTodo: true },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // If event has a linked todo, delete it first
  if (event.linkedTodoId) {
    await prisma.todo.delete({
      where: { id: event.linkedTodoId },
    });
  }

  // Delete the event itself
  await prisma.event.delete({
    where: { id: Number(id) },
  });

  return NextResponse.json({ success: true });
}
