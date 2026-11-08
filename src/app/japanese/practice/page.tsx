"use client";

import { vocabularyReadings, acceptsJapaneseAnswer } from "@/lib/japanese/readings";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isKanji } from "@/lib/japanese/kanji-writing";
import { useSnackbar } from "@/context/SnackbarContext";
import PracticeOverview from "@/components/PracticeOverview";
import type { PracticeSessionInput, PracticeSessionReview, PracticeStatus } from "@/lib/japanese/practice-session-types";

interface Category { id: number; name: string; }
interface Activity { id: number; activity: string; }
interface Word {
  id: number;
  english: string;
  japanese: string;
  hiragana: string;
  readings?: string[];
  read_hiragana: boolean;
  status: string;
  category_name: string | null;
}

function KanjiStroke({ character }: { character: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="practice-kanji flex items-center justify-center border rounded text-5xl" title="Stroke animation unavailable">{character}</span> : (
    <img src={`/kanji/${character}.gif`} alt={character} width={150} height={150}
      className="practice-kanji border rounded" onError={() => setFailed(true)} />
  );
}

export default function PracticePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<number>(1);
  const [nbWords, setNbWords] = useState<number>(10);
  const [starredOnly, setStarredOnly] = useState(false);


  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showingTranslation, setShowingTranslation] = useState(false);
  const [statusArray, setStatusArray] = useState<PracticeSessionInput["updates"]>([]);
  const [userInput, setUserInput] = useState("");
  const [inputColor, setInputColor] = useState("border-gray-300 focus:ring-blue-500");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const finishingRef = useRef(false);
  const startedAtRef = useRef("");
  const sessionKeyRef = useRef("");
  const practiceOptionsRef = useRef({ activity: selectedActivity, categories: selectedCategories, starredOnly });
  const [isStarting, setIsStarting] = useState(false);
  const [completedSession, setCompletedSession] = useState<PracticeSessionInput | null>(null);
  const [review, setReview] = useState<PracticeSessionReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const { showMessage } = useSnackbar();

  useEffect(() => {
    async function fetchData() {
      const actRes = await fetch("/api/japanese-practice/activities");
      setActivities(await actRes.json());
    }

    async function loadCategories() {
      try {
        const res = await fetch("/api/japanese-practice/categories");
        if (!res.ok) {
          showMessage(`Failed to fetch categories: ${res.statusText}`);
          return;
        }

        const data = await res.json();

        // Check for success before setting state
        if (!data.success || !data.categories) {
          showMessage("Failed to load categories: Invalid response");
          return;
        }

        setCategories(data.categories);
      } catch (err: unknown) {
        showMessage(`Failed to load categories: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    fetchData();
    loadCategories();
  }, []);

  const handleCheckbox = (id: number) => {
    setSelectedCategories(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleStart = async () => {
    if (isStarting) return;
    const startedAt = new Date().toISOString();
    const options = { categories: [...selectedCategories], nbWords, activity: selectedActivity, starredOnly };
    setIsStarting(true);
    try {
      const res = await fetch("/api/japanese-practice/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Unable to start practice. Please try again.");
      if (!data.words?.length) {
        showMessage("No vocabulary matches these practice options.");
        return;
      }
      startedAtRef.current = startedAt;
      sessionKeyRef.current = crypto.randomUUID();
      practiceOptionsRef.current = options;
      setSelectedActivity(options.activity);
      finishingRef.current = false;
      setCompletedSession(null);
      setReview(null);
      setReviewError("");
      setWords(data.words);
      setCurrentIndex(0);
      setShowingTranslation(false);
      setStatusArray([]);
      setUserInput("");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Unable to start practice. Please check your connection.");
    } finally {
      setIsStarting(false);
    }
  };

  const loadReview = async (input: PracticeSessionInput) => {
    setReviewLoading(true);
    setReviewError("");
    try {
      const res = await fetch("/api/japanese-practice/practice-sessions/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Unable to prepare your practice overview. Please try again.");
      setReview(data.review);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to prepare your practice overview.";
      setReviewError(message);
      showMessage(message);
    } finally {
      setReviewLoading(false);
    }
  };

  const saveReview = async () => {
    if (!completedSession || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const res = await fetch("/api/japanese-practice/practice-sessions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(completedSession),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || "Unable to save practice. Please try again.");
      setWords([]);
      setCurrentIndex(0);
      setShowingTranslation(false);
      setStatusArray([]);
      setUserInput("");
      setCompletedSession(null);
      setReview(null);
      finishingRef.current = false;
      showMessage("Practice saved successfully!");
    } catch (error) {
      showMessage(`${error instanceof Error ? error.message : "Unable to save practice."} Your results are kept. Press Okay to retry.`);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const showTranslation = () => {
    setShowingTranslation(true);
    if (selectedActivity === 3 && currentWord) setInputColor(acceptsJapaneseAnswer(userInput, currentWord) ? "border-green-500 focus:ring-green-500" : "border-red-500 focus:ring-red-500");
  };

  const setStatus = async (status: PracticeStatus) => {
    if (savingRef.current || finishingRef.current) return;
    const currentWord = words[currentIndex];
    if (!currentWord) return;
    const newStatuses = [
      ...statusArray.filter(item => item.activityVocabId !== currentWord.id),
      { activityVocabId: currentWord.id, status },
    ];
    setStatusArray(newStatuses);

    // Assign status to currentWord for border color
    currentWord.status = status;

    const nextIndex = currentIndex + 1;
    setInputColor("border-gray-300 focus:ring-blue-500");
    if (nextIndex < words.length) {
      setCurrentIndex(nextIndex);
      setShowingTranslation(false);
      setUserInput("");
    } else {
      finishingRef.current = true;
      const input: PracticeSessionInput = {
        sessionKey: sessionKeyRef.current, startedAt: startedAtRef.current, completedAt: new Date().toISOString(),
        ...practiceOptionsRef.current, updates: newStatuses,
      };
      setCompletedSession(input);
      await loadReview(input);
    }
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    window.speechSynthesis.speak(utterance);
  };

  const currentWord = words[currentIndex];

  const getTitle = () => {
    if (!words.length) return "Select Practice Options";
    const activityName = activities.find(a => a.id === selectedActivity)?.activity;
    return activityName || "Practice";
  };

  const getWordDisplay = () => {
    switch(selectedActivity) {
      case 1: return currentWord?.japanese; // kanji to english speaking
      case 2: return currentWord?.english; // english to japanese speaking
      case 3: return currentWord?.english; // english to japanese writing
      case 4: return currentWord?.japanese; // japanese to english listening
      case 5: return currentWord?.english; // kanji writing
      default: return currentWord?.english;
    }
  };

  const getTranslation = () => {
    switch(selectedActivity) {
      case 1: return currentWord?.english; // kanji to english speaking
      case 2: return currentWord?.japanese; // english to japanese speaking
      case 3: return currentWord?.japanese; // english to japanese writing
      case 4: return currentWord?.english; // japanese to english listening
      case 5: return currentWord?.japanese; // kanji writing
      default: return currentWord?.japanese;
    }
  };

  const getBorderColor = () => {
    if (!currentWord?.status) return "border-gray-700";
    switch(currentWord.status) {
      case "PERFECT": return "border-green-500";
      case "GOOD": return "border-yellow-500";
      case "WEAK": return "border-red-500";
      default: return "border-gray-700";
    }
  };

  // Global F1 / F2 / F3 keyboard shortcuts
  useEffect(() => {
    const handleFunctionKeys = (e: KeyboardEvent) => {
      if (finishingRef.current) return;
      if (e.key === "Enter") {
        e.preventDefault();
        showTranslation();
      } else if (showingTranslation) {
        if (e.key === "F1") {
          e.preventDefault();
          setStatus("PERFECT");
        } else if (e.key === "F2") {
          e.preventDefault();
          setStatus("GOOD");
        } else if (e.key === "F3") {
          e.preventDefault();
          setStatus("WEAK");
        }
      }
    };

    window.addEventListener("keydown", handleFunctionKeys);
    return () => window.removeEventListener("keydown", handleFunctionKeys);
  }, [words, currentWord, userInput, showingTranslation]);

  // Auto-play sound for japanese to english listening activity when word changes
  useEffect(() => {
    if (!completedSession && selectedActivity === 4 && words.length > 0 && !showingTranslation) {
      speak(currentWord.japanese);
    }
  }, [completedSession, currentIndex, selectedActivity, showingTranslation, currentWord, words]);

  if (completedSession) return (
    <div className="min-w-0">
      {review ? <PracticeOverview review={review} actions={<button type="button" onClick={() => void saveReview()} disabled={isSaving} className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">{isSaving ? "Saving…" : "Okay"}</button>} /> : (
        <div className="card max-w-3xl mx-auto space-y-4">
          <h1 className="text-2xl font-bold">Practice complete</h1>
          {reviewLoading && <p role="status">Preparing your practice overview…</p>}
          {reviewError && <><p role="alert" className="text-rose-500">{reviewError}</p><button type="button" onClick={() => void loadReview(completedSession)} disabled={reviewLoading} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">Retry overview</button></>}
        </div>
      )}
    </div>
  );

  return (
    <div className="practice-page flex items-center justify-center mt-10 text-white">
      <div className={`practice-card relative w-full max-w-lg rounded-xl p-5 sm:p-8 space-y-6 bg-gray-800 border-4 ${getBorderColor()} shadow-lg`}>
        <h2 className="text-2xl font-bold text-center">{getTitle()}</h2>

        {!words.length && (
          <div className="practice-options space-y-6 min-[2240px]:grid min-[2240px]:grid-cols-[1.2fr_1fr] min-[2240px]:gap-6 min-[2240px]:space-y-0">
            {/* Categories */}
            <div className="min-w-0 min-[2240px]:row-span-2">
              <h3 className="text-lg font-semibold mb-2">Categories</h3>
              <div className="practice-categories grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {categories.map(cat => (
                  <label
                    key={cat.id}
                    className="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.id)}
                      onChange={() => handleCheckbox(cat.id)}
                      className="accent-blue-500"
                    />
                    <span>{cat.name}</span>
                  </label>
                ))}
                <label
                    className="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={starredOnly}
                      onChange={() => setStarredOnly(prev => !prev)}
                      className="accent-yellow-400"
                    />
                    <span>Starred only</span>
                  </label>
              </div>
            </div>

            {/* Number of Words */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Number of Words</h3>
              <select
                value={nbWords}
                onChange={e => setNbWords(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {[10,25,50,100].map(n => (
                  <option key={n} value={n} className="bg-gray-700 text-white">{n}</option>
                ))}
              </select>
            </div>

            {/* Activity */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Activity</h3>
              <select
                value={selectedActivity}
                onChange={e => setSelectedActivity(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {activities.map(act => (
                  <option key={act.id} value={act.id} className="bg-gray-700 text-white">{act.activity}</option>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap justify-center gap-2 mt-4 min-[2240px]:col-span-2">
              <button
                onClick={handleStart}
                disabled={isStarting}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isStarting ? "Starting…" : "Start Practice"}
              </button>
              <Link
                href="/japanese/vocabulary"
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Vocabulary
              </Link>
            </div>
          </div>
        )}

        {/* Practice Words */}
        {words.length > 0 && currentWord && (
          <div className="practice-session text-center space-y-4">

            {/* Display word for activities other than japanese to english listening */}
            {selectedActivity !== 4 && (
              <div>
                <h3 className="practice-word text-xl font-bold">{getWordDisplay()}</h3>
                {currentWord.category_name && (
                  <p className="mt-1 text-sm text-gray-400">{currentWord.category_name}</p>
                )}
              </div>
            )}

            {selectedActivity === 4 && currentWord.category_name && <p className="mt-1 text-sm text-gray-400">{currentWord.category_name}</p>}

            {/* Input box for English → Japanese writing */}
            {selectedActivity === 3 && (
              <>
                <input
                  type="text"
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  autoFocus
                  placeholder="Type the Japanese word"
                  className={`w-full border rounded px-3 py-2 text-gray-900 bg-gray-100 focus:outline-none focus:ring-2 ${inputColor}`}
                />

                {!showingTranslation && (
                  <button
                    onClick={showTranslation}
                    className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                  >
                    Show Translation
                  </button>
                )}
              </>
            )}

            {/* Show translation button for all activities except writing */}
            {!showingTranslation && selectedActivity !== 3 && (
              <button
                onClick={showTranslation}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Show Translation
              </button>
            )}

            {/* Translation display */}
            {showingTranslation && (
              <div className="practice-translation">
                {selectedActivity === 4 ? ( // For japanese to english listening
                  <>
                    <h3 className="text-xl">{currentWord.english}</h3>
                    <h3 className="text-xl">{currentWord.japanese}</h3>
                    <h3 className="text-xl">{vocabularyReadings(currentWord).join(" / ")}</h3>
                  </>
                ) : selectedActivity === 5 ? ( // For kanji writing
                  <>
                    <div className="flex flex-wrap justify-center items-center gap-2">
                      {Array.from(currentWord.japanese).map((character, index) => isKanji(character) ? (
                        <KanjiStroke key={`${currentWord.id}-${index}`} character={character} />
                      ) : <span key={`${currentWord.id}-${index}`} className="text-3xl">{character}</span>)}
                    </div>
                    <h3 lang="ja" className="mt-3 text-xl">{vocabularyReadings(currentWord).join(" / ")}</h3>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl">{getTranslation()}</h3>
                    <h3 className="text-xl">{vocabularyReadings(currentWord).join(" / ")}</h3>
                  </>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 justify-center mt-2 flex-wrap">
              {showingTranslation && (
                <>
                  <button
                    onClick={() => setStatus("PERFECT")}
                    disabled={isSaving}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
                  >
                    PERFECT
                  </button>
                  <button
                    onClick={() => setStatus("GOOD")}
                    disabled={isSaving}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition disabled:opacity-50"
                  >
                    GOOD
                  </button>
                  <button
                    onClick={() => setStatus("WEAK")}
                    disabled={isSaving}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition disabled:opacity-50"
                  >
                    WEAK
                  </button>
                </>
              )}

              {/* Hear again button only for japanese to english listening activity */}
              {selectedActivity === 4 && (
                <button
                  onClick={() => speak(currentWord.japanese)}
                  className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
                >
                  Hear Again
                </button>
              )}
            </div>
            
            {isSaving && <p role="status">Saving practice…</p>}
            <p>{currentIndex + 1}/{words.length}</p>
          </div>
        )}


      </div>
    </div>
  );
}
