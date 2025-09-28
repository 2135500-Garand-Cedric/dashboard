import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(categories);
}
