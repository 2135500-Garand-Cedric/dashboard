import JapaneseAccess from "@/components/JapaneseAccess";
import { SavedPracticeOverview } from "@/components/PracticeHistory";

async function SavedPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SavedPracticeOverview id={id} />;
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <JapaneseAccess capability="japanese.history.read">
      <SavedPracticePage {...props} />
    </JapaneseAccess>
  );
}
