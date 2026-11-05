// Calendar examples are confined to the development database.
module.exports = async function seedCalendarDemo(prisma, user, now = new Date()) {
  if (process.env.NODE_ENV !== "development") return;
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = month.find((part) => part.type === "year").value;
  const monthNumber = month.find((part) => part.type === "month").value;
  const examples = [
    [3, 16, "Weekly planning", "personal", null, false],
    [6, 18, "Japanese conversation practice", "course", null, false],
    [8, 15, "Assignment research", "task", 10, false],
    [11, 17, "Project outline due", "task", null, true],
    [13, 20, "Programming assignment due", "task", null, false],
    [14, 14, "Study group", "course", null, false],
    [16, 16, "Team project workshop", "course", 18, false],
    [19, 18, "Vocabulary review", "personal", null, true],
    [21, 17, "Lab report due", "task", null, false],
    [23, 18, "Japanese listening practice", "course", null, false],
    [25, 15, "Final project preparation", "task", 27, false],
    [28, 18, "Monthly review", "personal", null, false],
  ];
  // Use a UTC timestamp so seeding stays independent of the container timezone.
  const at = (day, hour) => new Date(`${year}-${monthNumber}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`);
  for (const [day, hour, name, type, endDay, completed] of examples) {
    const title = name;
    const existing = await prisma.event.findFirst({ where: { userId: user.id, title, date: at(day, hour) } });
    if (existing) continue;
    await prisma.event.create({ data: {
      userId: user.id, title, description: "Sample calendar event for development.",
      date: at(day, hour), endDate: endDay ? at(endDay, hour) : null,
      type: { course: "JPN2902", task: "CSI2101", personal: "Personal" }[type], completed,
    } });
  }
  console.log(`Created or verified ${examples.length} calendar samples for ${year}-${monthNumber}.`);
};
