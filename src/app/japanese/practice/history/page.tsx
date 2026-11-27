import JapaneseAccess from "@/components/JapaneseAccess";
import PracticeHistory from "@/components/PracticeHistory";

async function PracticeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; kind?: string; range?: string }>;
}) {
  const params = await searchParams;
  return (
    <PracticeHistory
      date={params.date ?? ""}
      kind={params.kind ?? "vocab"}
      range={params.range ?? "day"}
    />
  );
}

export default function Page(props: {
  searchParams: Promise<{ date?: string; kind?: string; range?: string }>;
}) {
  return (
    <JapaneseAccess capability="japanese.history.read">
      <PracticeHistoryPage {...props} />
    </JapaneseAccess>
  );
}
