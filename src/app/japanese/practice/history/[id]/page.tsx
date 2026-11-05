import { SavedPracticeOverview } from "@/components/PracticeHistory";

export default async function SavedPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SavedPracticeOverview id={id} />;
}
