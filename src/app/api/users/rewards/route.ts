import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // const session = await getServerSession(); // assumes next-auth
    // if (!session?.user?.id) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const { xp, coins } = await req.json();

    const updated = await prisma.user.update({
      where: { id: 1 },
      data: {
        totalXp: { increment: xp },
        coins: { increment: coins },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update rewards" }, { status: 500 });
  }
}
