import { requireOwner } from "@/lib/require-owner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const accessError = await requireOwner(request);
  if (accessError) return accessError;

  const { id } = await context.params;
  const body = await request.json();
  const data: { name?: string; color?: string; active?: boolean } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(body.color)) {
      return NextResponse.json({ error: "Invalid hex color" }, { status: 400 });
    }
    data.color = body.color;
  }
  if (body.active !== undefined) data.active = Boolean(body.active);

  try {
    const activityType = await prisma.activityType.update({
      where: { id: Number(id) },
      data,
    });
    return NextResponse.json(activityType);
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "That activity type already exists" }, { status: 409 });
    }
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Activity type not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to update activity type" }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: Context) {
  const accessError = await requireOwner(_);
  if (accessError) return accessError;

  const { id } = await context.params;
  const activityType = await prisma.activityType.findUnique({ where: { id: Number(id) } });
  if (!activityType) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.event.updateMany({ where: { type: activityType.name }, data: { type: null } }),
    prisma.activityType.delete({ where: { id: Number(id) } }),
  ]);

  return NextResponse.json({ success: true });
}