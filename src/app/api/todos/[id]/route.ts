import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const { done } = await request.json();

  const updatedTodo = await prisma.todo.update({
    where: { id: Number(id) },
    data: { done },
  });

  return NextResponse.json(updatedTodo);
}
