import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: any
) {
  const subtaskId = Number(context.params.subtaskId);

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
