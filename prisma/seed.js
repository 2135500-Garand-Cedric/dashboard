require("dotenv").config();

const { PrismaClient } = require("../src/generated/prisma");

const prisma = new PrismaClient();
const userEmail = process.env.SEED_USER_EMAIL || "cedricgarand@hotmail.com";

const daysFromNow = (days, hour = 12) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

async function findOrCreate(model, where, data) {
  const existing = await model.findFirst({ where });
  return existing || model.create({ data });
}

async function ensureActivityVocab(activityId, vocabId, status) {
  const existing = await prisma.activityVocab.findFirst({
    where: { activityId, vocabId },
  });

  return existing || prisma.activityVocab.create({
    data: { activityId, vocabId, status },
  });
}

async function ensureVerbActivityVocab(activityId, verbFormId, status) {
  const existing = await prisma.activityVocab.findFirst({
    where: { activityId, verbFormId },
  });

  return existing || prisma.activityVocab.create({
    data: { activityId, verbFormId, status },
  });
}

async function main() {
  const userCount = await prisma.user.count();
  let user = await prisma.user.findUnique({ where: { email: userEmail } });

  if (!user) {
    user = await prisma.user.create({
      data: userCount === 0
        ? {
            id: 1,
            email: userEmail,
            name: "Cedric Garand",
            totalXp: 245,
            coins: 80,
          }
        : {
            email: userEmail,
            name: "Cedric Garand",
            totalXp: 245,
            coins: 80,
          },
    });
  }

  const activities = [
    [1, "Kanji to English speaking"],
    [2, "English to Japanese speaking"],
    [3, "English to Japanese writing"],
    [4, "Japanese to English listening"],
    [5, "Kanji writing"],
  ];

  for (const [id, activity] of activities) {
    const existing = await prisma.activity.findUnique({ where: { id } });
    if (!existing) await prisma.activity.create({ data: { id, activity } });
  }

  const categories = {};
  for (const [id, name] of [
    [1, "Verb"],
    [2, "Kanji"],
    [3, "Vocabulary"],
    [4, "Daily phrases"],
  ]) {
    const category = await prisma.category.findUnique({ where: { id } }) ||
      await prisma.category.create({ data: { id, name } });
    categories[name] = category;
  }

  for (const activityType of [
    { name: "CSI2101", color: "#ef4444" },
    { name: "CSI2120", color: "#3b82f6" },
    { name: "JPN2902", color: "#f97316" },
    { name: "CSI2132", color: "#a855f7" },
    { name: "CSI2911", color: "#06b6d4" },
    { name: "Personal", color: "#22c55e" },
  ]) {
    await prisma.activityType.upsert({
      where: { name: activityType.name },
      update: {},
      create: activityType,
    });
  }

  const quests = [];
  for (const questData of [
    { title: "Review five Japanese words", type: "daily", xp: 40, coins: 10 },
    { title: "Complete one practice session", type: "daily", xp: 60, coins: 15 },
    { title: "Finish three dashboard tasks", type: "weekly", xp: 150, coins: 40 },
  ]) {
    const quest = await findOrCreate(
      prisma.quest,
      { title: questData.title },
      questData
    );
    quests.push(quest);
  }

  await prisma.userQuest.upsert({
    where: { userId_questId: { userId: user.id, questId: quests[0].id } },
    update: { completed: true, lastCompleted: daysFromNow(0, 9) },
    create: {
      userId: user.id,
      questId: quests[0].id,
      completed: true,
      lastCompleted: daysFromNow(0, 9),
    },
  });

  for (const quest of quests.slice(1)) {
    await prisma.userQuest.upsert({
      where: { userId_questId: { userId: user.id, questId: quest.id } },
      update: {},
      create: { userId: user.id, questId: quest.id },
    });
  }

  const todoData = [
    {
      title: "Review Japanese vocabulary",
      description: "Review the new words and mark the difficult ones for another pass.",
      status: "IN_PROGRESS",
      priority: 1,
      rewardXp: 30,
      rewardCoins: 8,
    },
    {
      title: "Plan next week's goals",
      description: "Choose a few realistic goals for Japanese practice and personal projects.",
      status: "TODO",
      priority: 2,
      rewardXp: 50,
      rewardCoins: 12,
    },
    {
      title: "Set up the dashboard database",
      description: "Create the local database and verify the main dashboard workflows.",
      status: "DONE",
      priority: 3,
      rewardXp: 75,
      rewardCoins: 20,
    },
  ];

  const todos = [];
  for (const data of todoData) {
    todos.push(await findOrCreate(
      prisma.todo,
      { userId: user.id, title: data.title },
      { ...data, userId: user.id }
    ));
  }

  await prisma.todo.update({
    where: { id: todos[1].id },
    data: { dependsOnId: todos[0].id },
  });

  for (const [todo, subtasks] of [
    [todos[0], [["Read the example sentences", true], ["Practice the starred words", false]]],
    [todos[1], [["Review the calendar", false]]],
    [todos[2], [["Start PostgreSQL", true], ["Run the migrations", true]]],
  ]) {
    for (const [title, done] of subtasks) {
      await findOrCreate(
        prisma.subtask,
        { todoId: todo.id, title },
        { todoId: todo.id, title, done }
      );
    }
  }

  for (const eventData of [
    {
      title: "Japanese conversation practice",
      description: "Thirty minutes of speaking practice.",
      date: daysFromNow(1, 18),
      type: "course",
    },
    {
      title: "Submit dashboard review",
      description: "Review the completed dashboard setup task.",
      date: daysFromNow(3, 10),
      type: "task",
      linkedTodoId: todos[2].id,
    },
    {
      title: "Weekend planning",
      description: "Set aside time for study, exercise, and rest.",
      date: daysFromNow(5, 9),
      type: "personal",
    },
    {
      title: "Future idea: language exchange",
      description: "Find a local or online language exchange partner.",
      date: null,
      type: "personal",
    },
  ]) {
    await findOrCreate(
      prisma.event,
      { userId: user.id, title: eventData.title },
      { ...eventData, userId: user.id }
    );
  }

  const vocabularyData = [
    {
      english: "cat",
      japanese: "猫",
      hiragana: "ねこ",
      categoryId: categories.Kanji.id,
      starred: true,
      readHiragana: true,
    },
    {
      english: "school",
      japanese: "学校",
      hiragana: "がっこう",
      categoryId: categories.Kanji.id,
      starred: false,
      readHiragana: true,
    },
    {
      english: "to eat",
      japanese: "食べる",
      hiragana: "たべる",
      categoryId: categories.Verb.id,
      verbType: "ru",
      starred: true,
    },
    {
      english: "to study",
      japanese: "勉強する",
      hiragana: "べんきょうする",
      categoryId: categories.Verb.id,
      verbType: "suru",
      starred: false,
    },
    {
      english: "thank you",
      japanese: "ありがとう",
      hiragana: "ありがとう",
      categoryId: categories["Daily phrases"].id,
      starred: true,
    },
    {
      english: "delicious",
      japanese: "おいしい",
      hiragana: "おいしい",
      categoryId: categories.Vocabulary.id,
      starred: false,
    },
  ];

  const vocabulary = {};
  for (const data of vocabularyData) {
    const word = await findOrCreate(
      prisma.vocabulary,
      { english: data.english, hiragana: data.hiragana, userId: user.id },
      { ...data, userId: user.id }
    );
    vocabulary[data.english] = word;

    const statuses = ["PERFECT", "GOOD", "WEAK", "GOOD", "PERFECT"];
    for (let index = 0; index < activities.length; index += 1) {
      await ensureActivityVocab(index + 1, word.id, statuses[index]);
    }
  }

  const verbForms = [
    ["masu", "食べます", "たべます"],
    ["masen", "食べません", "たべません"],
    ["nai", "食べない", "たべない"],
    ["ta", "食べた", "たべた"],
    ["nakatta", "食べなかった", "たべなかった"],
    ["mashita", "食べました", "たべました"],
    ["masen_deshita", "食べませんでした", "たべませんでした"],
    ["te", "食べて", "たべて"],
    ["volitional", "食べよう", "たべよう"],
    ["potential", "食べられる", "たべられる"],
    ["tai", "食べたい", "たべたい"],
  ];

  for (const [name, form, reading] of verbForms) {
    const formType = await prisma.verbFormType.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} form` },
    });
    const verbForm = await prisma.verbForm.upsert({
      where: {
        baseVocabId_formTypeId: {
          baseVocabId: vocabulary["to eat"].id,
          formTypeId: formType.id,
        },
      },
      update: { form, reading },
      create: {
        baseVocabId: vocabulary["to eat"].id,
        formTypeId: formType.id,
        form,
        reading,
      },
    });

    for (const [index, status] of ["PERFECT", "GOOD", "WEAK", "GOOD", "PERFECT"].entries()) {
      await ensureVerbActivityVocab(index + 1, verbForm.id, status);
    }
  }

  const practiceDates = [daysFromNow(0, 8), daysFromNow(0, 13), daysFromNow(-2, 19)];
  const practiceData = [
    { activityId: 1, wordCount: 8, perfectCount: 5, goodCount: 2, weakCount: 1 },
    { activityId: 5, wordCount: 6, perfectCount: 3, goodCount: 2, weakCount: 1 },
    { activityId: 3, wordCount: 10, perfectCount: 7, goodCount: 2, weakCount: 1 },
  ];

  for (let index = 0; index < practiceData.length; index += 1) {
    const data = practiceData[index];
    const existing = await prisma.practice.findFirst({
      where: { activityId: data.activityId, date: practiceDates[index] },
    });
    if (!existing) await prisma.practice.create({ data: { ...data, date: practiceDates[index] } });
  }

  console.log(`Seed complete for ${user.email} (user id ${user.id}).`);
  console.log("Created or verified dashboard, Japanese practice, quest, todo, event, and practice data.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });