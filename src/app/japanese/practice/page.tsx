"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSnackbar } from "@/context/SnackbarContext";

interface Category { id: number; name: string; }
interface Activity { id: number; activity: string; }
interface Word {
  id: number;
  english: string;
  japanese: string;
  hiragana: string;
  read_hiragana: boolean;
  status?: string;
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
  const [statusArray, setStatusArray] = useState<{ vocabId:number,status:string,activity:number }[]>([]);
  const [userInput, setUserInput] = useState("");
  const [inputColor, setInputColor] = useState("border-gray-300 focus:ring-blue-500");
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
      } catch (err: any) {
        showMessage(`Failed to load categories: ${err.message || err}`);
      }
    };
    fetchData();
    loadCategories();
  }, []);

  const handleCheckbox = (id: number) => {
    setSelectedCategories(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleStart = async () => {
    let categoriesToSend = selectedCategories;

    if (selectedActivity === 5 && categories.find(c => c.name === 'Kanji')?.id) {
      categoriesToSend.push(categories.find(c => c.name === 'Kanji')!.id);
    }

    // If no categories selected, use all category IDs
    if (!selectedCategories.length) {
      categoriesToSend = categories.map(c => c.id);
    }

    const res = await fetch("/api/japanese-practice/vocabulary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: categoriesToSend, nbWords, activity: selectedActivity, starredOnly })
    });

    const data = await res.json();
    if (data.success) {
      setWords(shuffleArray(data.words));
      setCurrentIndex(0);
      setShowingTranslation(false);
      setStatusArray([]);
      setUserInput("");
    } else {
      showMessage(data.error);
    }
  };

  const shuffleArray = (arr: Word[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const showTranslation = () => setShowingTranslation(true);

  const setStatus = (status: "PERFECT"|"GOOD"|"WEAK") => {
    const currentWord = words[currentIndex];
    const newStatuses = [...statusArray, { vocabId: currentWord.id, status, activity: selectedActivity }];
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
      // Save statuses and reset
      fetch("/api/japanese-practice/vocabulary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStatuses)
      }).then(() => {
        setWords([]);
        setCurrentIndex(0);
        setShowingTranslation(false);
        setStatusArray([]);
        setUserInput("");
      });
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
      if (e.key === "Enter") {
        e.preventDefault();
        showTranslation();
        if (userInput === currentWord?.hiragana || userInput === currentWord?.japanese) {
          setInputColor("border-green-500 focus:ring-green-500");
        } else {
          setInputColor("border-red-500 focus:ring-red-500");
        }
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
    if (selectedActivity === 4 && words.length > 0 && !showingTranslation) {
      speak(currentWord.japanese);
    }
  }, [currentIndex, selectedActivity, showingTranslation, currentWord, words]);


  return (
    <div className="flex items-center justify-center mt-10 bg-gray-900 text-white">
      <div className={`relative w-full max-w-lg rounded-xl p-8 space-y-6 bg-gray-800 border-4 ${getBorderColor()} shadow-lg`}>
        <h2 className="text-2xl font-bold text-center">{getTitle()}</h2>

        {!words.length && (
          <>
            {/* Categories */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Categories</h3>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
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
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={handleStart}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Start Practice
              </button>
              <Link
                href="/japanese/vocabulary"
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Vocabulary
              </Link>
            </div>
          </>
        )}

        {/* Practice Words */}
        {words.length > 0 && currentWord && (
          <div className="text-center space-y-4">

            {/* Display word for activities other than japanese to english listening */}
            {selectedActivity !== 4 && (
              <h3 className="text-xl font-bold">{getWordDisplay()}</h3>
            )}

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
              <div>
                {selectedActivity === 4 ? ( // For japanese to english listening
                  <>
                    <h3 className="text-xl">{currentWord.english}</h3>
                    <h3 className="text-xl">{currentWord.japanese}</h3>
                    <h3 className="text-xl">{currentWord.hiragana}</h3>
                  </>
                ) : selectedActivity === 5 ? ( // For kanji writing
                  <div className="flex justify-center items-center">
                    <img
                      src={`/kanji/${currentWord.japanese}.gif`}
                      alt={currentWord.japanese}
                      width={150}
                      height={150}
                      className="border rounded"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        // replace the image with a placeholder div
                        const placeholder = document.createElement("div");
                        placeholder.style.width = "150px";
                        placeholder.style.height = "150px";
                        placeholder.style.border = "1px solid #ccc";
                        placeholder.style.borderRadius = "0.25rem"; // same as rounded
                        placeholder.style.display = "flex";
                        placeholder.style.alignItems = "center";
                        placeholder.style.justifyContent = "center";
                        placeholder.style.backgroundColor = "#f9f9f9";
                        placeholder.style.color = "#888";
                        placeholder.style.fontSize = "14px";
                        placeholder.innerText = "Not Found";
                        img.replaceWith(placeholder);
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl">{getTranslation()}</h3>
                    <h3 className="text-xl">{currentWord.hiragana}</h3>
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
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition"
                  >
                    PERFECT
                  </button>
                  <button
                    onClick={() => setStatus("GOOD")}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition"
                  >
                    GOOD
                  </button>
                  <button
                    onClick={() => setStatus("WEAK")}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
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
            
            <p>{currentIndex + 1}/{words.length}</p>
          </div>
        )}


      </div>
    </div>
  );
}
