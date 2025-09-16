import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { questId, add, xp, coins } = await req.json();
    const userId = 1; // Replace with authenticated user

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Update XP and coins
    const newXp = add ? user.totalXp + xp : user.totalXp - xp;
    const newCoins = add ? user.coins + coins : user.coins - coins;

    await prisma.user.update({
      where: { id: userId },
      data: { totalXp: newXp, coins: newCoins },
    });

    // Update UserQuest
    await prisma.userQuest.upsert({
      where: { userId_questId: { userId, questId } },
      update: { completed: add, lastCompleted: add ? new Date() : null },
      create: { userId, questId, completed: add, lastCompleted: add ? new Date() : null },
    });

    return NextResponse.json({ success: true, totalXp: newXp, coins: newCoins });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update quest" }, { status: 500 });
  }
}

export async function GET() {
  const userId = 1; // Replace with authenticated user

  const userQuests = await prisma.userQuest.findMany({
    where: { userId },
    include: { quest: true },
  });

  // Flatten for frontend
  const quests = userQuests.map(uq => ({
    id: uq.quest.id,
    title: uq.quest.title,
    type: uq.quest.type,
    xp: uq.quest.xp,
    coins: uq.quest.coins,
    completed: uq.completed,
    lastCompleted: uq.lastCompleted,
  }));

  return NextResponse.json(quests);
}

