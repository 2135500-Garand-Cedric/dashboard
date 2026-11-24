export function weeklyPdfFixture() {
  const list = (total) => ({ total, items: [], nextCursor: null });
  const wrap = (data) => ({ data, error: null });
  const practice = {
    sessions: 4,
    reviews: 100,
    weak: 10,
    good: 30,
    perfect: 60,
    durationSeconds: 1234,
    partialTime: false,
    impact: 2.45,
    partialImpact: false,
  };
  return {
    period: {
      week: "2026-11-16",
      lastDay: "2026-11-22",
      asOf: "2026-11-23T14:00:00Z",
      currency: "CAD",
      dataset: "all",
    },
    work: wrap({ completed: list(12), reopened: list(2), cancelled: list(1) }),
    knowledge: wrap({ created: list(3), changed: list(5) }),
    japanese: wrap({
      vocab: practice,
      kanji: {
        ...practice,
        sessions: 2,
        reviews: 50,
        weak: 5,
        good: 20,
        perfect: 25,
        durationSeconds: null,
        partialTime: true,
        impact: null,
        partialImpact: true,
      },
    }),
    finance: wrap({
      totals: {
        income: "2450.0000",
        expenses: "682.3500",
        net: "1767.6500",
        adjustments: "0.0000",
      },
      unmatched: list(3),
    }),
  };
}
