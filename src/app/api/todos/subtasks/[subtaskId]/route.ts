// src/app/api/todos/subtasks/[subtaskId]/route.ts
export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  context: { params: { subtaskId: string } }
) {
  // Use `await context.params` if needed
  const { params } = context;
  const subtaskId = Number(params.subtaskId);

  if (isNaN(subtaskId)) {
    return NextResponse.json({ error: "Invalid subtaskId" }, { status: 400 });
  }

  try {
    const body = await request.json();

    const updated = await prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        done: body.done ?? undefined,
        title: body.title ?? undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
