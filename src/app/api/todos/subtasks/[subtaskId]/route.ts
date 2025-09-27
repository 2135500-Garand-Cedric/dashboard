import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// DELETE subtask
export async function DELETE(
  request: Request,
  context: { params: { subtaskId: string } }
) {
  const subtaskId = Number(context.params.subtaskId);

  if (isNaN(subtaskId)) {
    return NextResponse.json({ error: "Invalid subtaskId" }, { status: 400 });
  }

  try {
    await prisma.subtask.delete({
      where: { id: subtaskId },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH subtask
export async function PATCH(
  request: Request,
  context: { params: { subtaskId: string } }
) {
  const subtaskId = Number(context.params.subtaskId);

  if (isNaN(subtaskId)) {
    return NextResponse.json({ error: "Invalid subtaskId" }, { status: 400 });
  }

  try {
    const body = await request.json();

    // Update subtask
    const updatedSubtask = await prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        done: body.done ?? undefined,
        title: body.title ?? undefined,
      },
      include: { todo: true }, // include parent todo
    });

    // Update parent todo's updatedAt
    await prisma.todo.update({
      where: { id: updatedSubtask.todoId },
      data: { updatedAt: new Date() }, // force updatedAt to now
    });

    return NextResponse.json(updatedSubtask);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

