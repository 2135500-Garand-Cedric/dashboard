// src/app/api/todos/route.ts
export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Get all todos
export async function GET() {
  const todos = await prisma.todo.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(todos);
}

// Create a new todo
export async function POST(request: Request) {
  const { text } = await request.json();
  const todo = await prisma.todo.create({
    data: { text },
  });
  return NextResponse.json(todo);
}