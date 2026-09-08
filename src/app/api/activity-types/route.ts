import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const activityTypes = await prisma.activityType.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(activityTypes);
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const color = typeof body.color === "string" ? body.color : "";

  if (!name || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json(
      { error: "A name and a valid hex color are required" },
      { status: 400 }
    );
  }

  try {
    const activityType = await prisma.activityType.create({
      data: { name, color, active: body.active !== false },
    });
    return NextResponse.json(activityType, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "That activity type already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create activity type" }, { status: 500 });
  }
}