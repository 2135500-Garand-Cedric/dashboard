import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export function completeWeeklyReport(report) {
  return ["work", "japanese", "knowledge", "finance"].every(
    (key) => report[key]?.data && !report[key].error,
  );
}

// Dedicated one-page A4 layout: summary statistics only, no browser/HTML renderer.
export async function renderWeeklyReportPdf(report) {
  if (!completeWeeklyReport(report)) throw new Error("REPORT_INCOMPLETE");
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.07, 0.12, 0.21),
    muted = rgb(0.38, 0.43, 0.5);
  const blue = rgb(0.16, 0.39, 0.72),
    green = rgb(0.02, 0.52, 0.36);
  const red = rgb(0.81, 0.2, 0.31),
    yellow = rgb(0.86, 0.58, 0.08);
  function text(value, x, y, size = 11, color = navy, strong = false, width = 510) {
    const font = strong ? bold : regular;
    const content = String(value);
    while (size > 7 && font.widthOfTextAtSize(content, size) > width) size -= 0.5;
    page.drawText(content, { x, y, size, font, color });
  }
  function box(x, y, width, height, title, color = blue) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(0.96, 0.97, 0.985),
      borderColor: rgb(0.86, 0.89, 0.92),
      borderWidth: 0.5,
    });
    text(title, x + 16, y + height - 28, 14, color, true);
  }
  function date(day) {
    return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(`${day}T12:00:00Z`),
    );
  }
  const count = (value) => new Intl.NumberFormat("en-CA").format(value);
  const money = (value) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value));
  doc.setTitle(`Weekly report ${report.period.week}`);
  doc.setCreator("Personal dashboard");
  doc.setCreationDate(new Date(report.period.asOf));
  text("Weekly report", 38, 789, 27, navy, true);
  text(`${date(report.period.week)} - ${date(report.period.lastDay)}`, 38, 765, 12, muted);

  const work = report.work.data,
    knowledge = report.knowledge.data;
  box(38, 586, 251, 149, "Work");
  text(count(work.completed.total), 54, 651, 36, blue, true);
  text("Tasks completed", 54, 629);
  text(
    `${count(work.reopened.total)} reopened     ${count(work.cancelled.total)} cancelled`,
    54,
    605,
    10,
    muted,
  );
  box(305, 586, 252, 149, "Knowledge", rgb(0.45, 0.28, 0.69));
  text(count(knowledge.created.total), 321, 651, 31, navy, true);
  text(count(knowledge.changed.total), 437, 651, 31, navy, true);
  text("Articles created", 321, 629, 10);
  text("Articles updated", 437, 629, 10);

  box(38, 335, 519, 233, "Japanese practice", red);
  function practice(data, label, x) {
    text(label, x, 512, 12, navy, true);
    text(`${count(data.sessions)} sessions`, x, 486, 17, navy, true, 220);
    text(`${count(data.reviews)} word reviews`, x, 465, 12);
    const values = [data.weak, data.good, data.perfect];
    const total = values.reduce((sum, value) => sum + value, 0);
    page.drawRectangle({ x, y: 438, width: 220, height: 9, color: rgb(0.88, 0.9, 0.93) });
    let offset = x;
    values.forEach((value, index) => {
      const width = total ? (value / total) * 220 : 0;
      if (width)
        page.drawRectangle({
          x: offset,
          y: 438,
          width,
          height: 9,
          color: [red, yellow, green][index],
        });
      offset += width;
    });
    text(
      `Weak ${count(data.weak)}   Good ${count(data.good)}   Perfect ${count(data.perfect)}`,
      x,
      420,
      9,
      muted,
      false,
      220,
    );
    const duration =
      data.durationSeconds === null
        ? "Not recorded"
        : `${Math.floor(data.durationSeconds / 60)}m ${data.durationSeconds % 60}s${data.partialTime ? " (partial)" : ""}`;
    text(`Time: ${duration}`, x, 392, 10, muted, false, 220);
    const impact =
      data.impact === null
        ? "Not recorded"
        : `${data.impact > 0 ? "+" : ""}${data.impact.toFixed(2)} pp${data.partialImpact ? " (partial)" : ""}`;
    text(`Practice impact: ${impact}`, x, 371, 11, data.impact > 0 ? green : navy, true, 220);
  }
  practice(report.japanese.data.vocab, "Vocabulary", 54);
  practice(report.japanese.data.kanji, "Kanji writing", 321);

  box(38, 109, 519, 208, "Finance (CAD)", green);
  const finance = report.finance.data;
  const columns = [
    ["Income received", finance.totals.income, green],
    ["Spent after refunds", finance.totals.expenses, red],
    ["Net cash flow", finance.totals.net, Number(finance.totals.net) < 0 ? red : green],
  ];
  columns.forEach(([label, amount, color], index) => {
    const x = 54 + index * 164;
    text(label, x, 257, 10, muted);
    text(money(amount), x, 232, 20, color, true, 150);
  });
  const max = Math.max(
    Math.abs(Number(finance.totals.income)),
    Math.abs(Number(finance.totals.expenses)),
    1,
  );
  [finance.totals.income, finance.totals.expenses].forEach((value, index) => {
    page.drawRectangle({
      x: 54,
      y: 203 - index * 15,
      width: 487,
      height: 7,
      color: rgb(0.88, 0.9, 0.93),
    });
    const width = (Math.abs(Number(value)) / max) * 487;
    if (width)
      page.drawRectangle({
        x: 54,
        y: 203 - index * 15,
        width,
        height: 7,
        color: index ? red : green,
      });
  });
  text(`${count(finance.unmatched.total)} awaiting statement match`, 54, 164, 10, muted);
  if (Number(finance.totals.adjustments))
    text(
      `Cash flow includes ${money(finance.totals.adjustments)} in adjustments.`,
      54,
      145,
      9,
      muted,
    );
  text("All data. Transfers excluded. Recorded activity only.", 54, 126, 9, muted);
  text(
    "Practice impact = sum of measured session changes, in percentage points (pp).",
    38,
    79,
    9,
    muted,
  );
  text(
    "Partial = some saved sessions have no measurement. Report reflects data when prepared.",
    38,
    64,
    9,
    muted,
  );
  return Buffer.from(await doc.save());
}
