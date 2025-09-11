// src/app/api/todos/route.ts
export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const todos = await prisma.todo.findMany({
    include: { subtasks: true, dependsOn: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(todos);
}

export async function POST(request: Request) {
  const { title, description, priority, dependsOnId } = await request.json();

  const todo = await prisma.todo.create({
    data: {
      title: title ?? "no title",
      description: description ?? "",
      priority: priority ?? 1,
      dependsOnId: dependsOnId ?? undefined,
    },
  });

  return NextResponse.json(todo);
}
