// src/app/api/todos/[id]/subtasks/route.ts
export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params; // ✅ Await params
  const todoId = Number(id);

  const { title } = await request.json();
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const subtask = await prisma.subtask.create({
    data: { title, todoId },
  });

  return NextResponse.json(subtask);
}
