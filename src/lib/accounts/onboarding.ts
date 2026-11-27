import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { identityAudit } from "./identity";
import { getKnownKanji, isKanjiWritingEligible } from "@/lib/japanese/kanji-writing";

type Pack = {
  categories: { key: number; name: string; kind: string }[];
  words: {
    key: number;
    english: string;
    japanese: string | null;
    hiragana: string;
    readings: string[];
    categoryKey: number | null;
    readHiragana: boolean;
    verbType: string | null;
    forms: { formTypeId: number; form: string; reading: string }[];
  }[];
};
export async function initializeJapanese(userId: number, value: unknown) {
  const body = value as { choice?: string; timeZone?: string; name?: string };
  if (
    !body ||
    !["EMPTY", "PACK"].includes(body.choice ?? "") ||
    typeof body.timeZone !== "string" ||
    body.timeZone.length > 100 ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 100
  )
    throw new Error("Choose a name, timezone and vocabulary option.");
  const zone = new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).resolvedOptions()
    .timeZone;
  return prisma.$transaction(
    async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(94741, ${userId}::integer)`;
      const user = await db.user.findFirst({ where: { id: userId, active: true } });
      if (!user) throw new Error("Account unavailable.");
      const done = await db.japaneseInitialization.findUnique({ where: { userId } });
      if (done) return done;
      const version =
        body.choice === "PACK"
          ? await db.vocabularyPackVersion.findFirst({ orderBy: { id: "desc" } })
          : null;
      if (body.choice === "PACK" && !version)
        throw new Error("The starter vocabulary is not available yet.");
      const pack = version?.content as unknown as Pack | null;
      const categories = [
        ...(pack?.categories ?? [
          { key: 1, name: "Verb", kind: "VERB" },
          { key: 2, name: "Kanji", kind: "KANJI" },
          { key: 3, name: "Vocabulary", kind: "OTHER" },
        ]),
      ];
      for (const [name, kind] of [
        ["Verb", "VERB"],
        ["Kanji", "KANJI"],
      ]) {
        if (!categories.some((c) => c.name.trim().toLowerCase() === name.toLowerCase()))
          categories.push({ key: -categories.length - 1, name, kind });
      }
      await db.category.createMany({
        data: categories.map((c) => ({
          userId,
          name:
            c.name.trim().toLowerCase() === "verb"
              ? "Verb"
              : c.name.trim().toLowerCase() === "kanji"
                ? "Kanji"
                : c.name,
          normalizedName: c.name.trim().toLowerCase(),
          kind: ["verb", "kanji"].includes(c.name.trim().toLowerCase())
            ? c.name.trim().toUpperCase()
            : c.kind,
          isDefault: ["verb", "kanji"].includes(c.name.trim().toLowerCase()),
        })),
        skipDuplicates: true,
      });
      const owned = await db.category.findMany({ where: { userId } });
      const catMap = new Map(
        categories.map((c) => [
          c.key,
          owned.find((row) => row.normalizedName === c.name.trim().toLowerCase())!.id,
        ]),
      );
      const words = pack?.words ?? [];
      // Bulk operations remain inside one rollback-safe transaction; no copied progress.
      for (let start = 0; start < words.length; start += 250) {
        await db.vocabulary.createMany({
          data: words.slice(start, start + 250).map((w) => ({
            userId,
            english: w.english,
            japanese: w.japanese,
            hiragana: w.hiragana,
            readings: w.readings,
            readHiragana: w.readHiragana,
            verbType: w.verbType,
            categoryId: w.categoryKey === null ? null : catMap.get(w.categoryKey),
          })),
        });
      }
      const rows = await db.vocabulary.findMany({ where: { userId }, include: { category: true } });
      const lookup = new Map(rows.map((w) => [JSON.stringify([w.english, w.hiragana]), w.id]));
      const formData = words.flatMap((w) =>
        w.forms.map((f) => ({
          ...f,
          userId,
          baseVocabId: lookup.get(JSON.stringify([w.english, w.hiragana]))!,
        })),
      );
      for (let start = 0; start < formData.length; start += 500)
        await db.verbForm.createMany({ data: formData.slice(start, start + 500) });
      const forms = await db.verbForm.findMany({ where: { userId }, select: { id: true } });
      const activities = await db.activity.findMany({ select: { id: true } });
      const known = getKnownKanji(rows);
      const links = [
        ...rows.flatMap((w) =>
          activities
            .filter((a) => a.id !== 5 || isKanjiWritingEligible(w.japanese, known))
            .map((a) => ({ userId, activityId: a.id, vocabId: w.id })),
        ),
        ...forms.flatMap((f) =>
          activities
            .filter((a) => a.id !== 5)
            .map((a) => ({ userId, activityId: a.id, verbFormId: f.id })),
        ),
      ];
      for (let start = 0; start < links.length; start += 1000)
        await db.activityVocab.createMany({ data: links.slice(start, start + 1000) });
      await db.user.update({
        where: { id: userId },
        data: { name: body.name!.trim(), timeZone: zone },
      });
      const saved = await db.japaneseInitialization.create({
        data: { userId, choice: body.choice!, packVersionId: version?.id },
      });
      await identityAudit(
        db,
        userId,
        userId,
        "account.initialized",
        "Japanese workspace initialized",
        { type: body.choice, count: words.length },
      );
      return saved;
    },
    { timeout: 60000, maxWait: 15000, isolationLevel: "ReadCommitted" },
  );
}
export async function publishStarter(db: Prisma.TransactionClient) {
  const [categories, words] = await Promise.all([
    db.category.findMany({ where: { userId: 1 } }),
    db.vocabulary.findMany({
      where: { userId: 1 },
      include: { verbForms: { select: { formTypeId: true, form: true, reading: true } } },
      orderBy: { id: "asc" },
    }),
  ]);
  return db.vocabularyPackVersion.create({
    data: {
      wordCount: words.length,
      content: {
        categories: categories.map((c) => ({ key: c.id, name: c.name, kind: c.kind })),
        words: words.map((w) => ({
          key: w.id,
          english: w.english,
          japanese: w.japanese,
          hiragana: w.hiragana,
          readings: w.readings,
          categoryKey: w.categoryId,
          readHiragana: w.readHiragana,
          verbType: w.verbType,
          forms: w.verbForms,
        })),
      },
    },
  });
}
