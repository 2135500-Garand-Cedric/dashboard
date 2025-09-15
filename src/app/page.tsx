import TodoTile from "@/components/TodoTile";
import MusicTile from "@/components/MusicTile";
import EventTile from "@/components/EventTile";

export default function Home() {
  return (
    <div
      className="p-8"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <h1
        className="text-3xl font-bold mb-6"
        style={{ color: "var(--color-foreground)" }}
      >
        My Dashboard
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <EventTile />
        <TodoTile />
        <MusicTile />
      </div>
    </div>
  );
}
