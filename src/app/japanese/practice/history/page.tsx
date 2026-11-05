import PracticeHistory from "@/components/PracticeHistory";

export default async function PracticeHistoryPage({ searchParams }: { searchParams: Promise<{ date?: string; kind?: string; range?: string }> }) {
  const params = await searchParams;
  return <PracticeHistory date={params.date ?? ""} kind={params.kind ?? "vocab"} range={params.range ?? "day"} />;
}
