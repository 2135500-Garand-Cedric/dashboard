// src/app/api/todos/[id]/route.ts
export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// ✅ Fix: Await context.params instead of destructuring directly
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const todo = await prisma.todo.findUnique({
    where: { id: Number(id) },
    include: { subtasks: true, dependsOn: true },
  });

  if (!todo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(todo);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json();

  // Check dependency before moving to IN_PROGRESS or DONE
  if (body.status === "IN_PROGRESS" || body.status === "DONE") {
    const item = await prisma.todo.findUnique({
      where: { id: Number(id) },
      include: { dependsOn: true },
    });

    if (item?.dependsOnId) {
      const dep = await prisma.todo.findUnique({
        where: { id: item.dependsOnId },
      });

      if (dep?.status !== "DONE") {
        return NextResponse.json(
          { error: `Cannot move to ${body.status}; dependency "${dep?.title}" is not completed.` },
          { status: 400 }
        );
      }
    }
  }

  const updated = await prisma.todo.update({
    where: { id: Number(id) },
    data: {
      title: body.title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      dependsOnId: body.dependsOnId ?? null,
      rewardXp: body.rewardXp,
      rewardCoins: body.rewardCoins,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  // Delete subtasks first
  await prisma.subtask.deleteMany({ where: { todoId: Number(id) } });

  // Then delete the todo
  await prisma.todo.delete({ where: { id: Number(id) } });

  return NextResponse.json({ ok: true });
}
