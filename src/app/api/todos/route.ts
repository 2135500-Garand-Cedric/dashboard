export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const todos = await prisma.todo.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(todos);
}

export async function POST(request: Request) {
  const { text } = await request.json();
  const todo = await prisma.todo.create({
    data: { text },
  });
  return NextResponse.json(todo);
}
