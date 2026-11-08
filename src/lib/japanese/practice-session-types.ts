export type PracticeStatus = "WEAK" | "GOOD" | "PERFECT";

export interface PracticeSessionInput {
  sessionKey: string;
  activity: number;
  startedAt: string;
  completedAt: string;
  categories: number[];
  starredOnly: boolean;
  updates: { activityVocabId: number; status: PracticeStatus }[];
}

export interface PracticeWordResult {
  activityVocabId: number;
  vocabId: number;
  english: string;
  japanese: string;
  hiragana: string;
  readings?: string[];
  categoryName: string | null;
  previousStatus: PracticeStatus;
  status: PracticeStatus;
}

export interface PracticeSessionSummary {
  id: number | null;
  activityId: number;
  activityName: string;
  date: string;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  wordCount: number;
  weakCount: number;
  goodCount: number;
  perfectCount: number;
  averageBefore: number | null;
  averageAfter: number | null;
  hasDetails: boolean;
}

export interface PracticeSessionReview extends PracticeSessionSummary {
  selectedCategories: { id: number; name: string }[] | null;
  starredOnly: boolean;
  words: PracticeWordResult[] | null;
}

export function formatPracticeDuration(seconds: number | null) {
  if (seconds === null) return "Not recorded";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${hours ? `${hours}h ` : ""}${minutes}m ${seconds % 60}s`;
}

export function practiceHistoryTotals(sessions: PracticeSessionSummary[]) {
  const timed = sessions.filter(session => session.durationSeconds !== null);
  const measured = sessions.filter(session => session.averageBefore !== null && session.averageAfter !== null);
  return {
    durationSeconds: timed.length || !sessions.length ? timed.reduce((sum, session) => sum + session.durationSeconds!, 0) : null,
    percentagePoints: measured.length || !sessions.length ? measured.reduce((sum, session) => sum + session.averageAfter! - session.averageBefore!, 0) : null,
    partialTime: timed.length < sessions.length,
    partialImprovement: measured.length < sessions.length,
  };
}
