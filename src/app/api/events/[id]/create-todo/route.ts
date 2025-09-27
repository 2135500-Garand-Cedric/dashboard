export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const eventId = Number(id);

  const body = await request.json();
  const { title } = body;

  const todo = await prisma.todo.create({
    data: { 
      title: title,
      user: { connect: { id: 1 } }
    },
    
  });

  const updatedEvent = await prisma.event.update({
    where: { id: eventId },
    data: { linkedTodoId: todo.id },
    include: { linkedTodo: true },
  });

  return NextResponse.json(updatedEvent);
}
