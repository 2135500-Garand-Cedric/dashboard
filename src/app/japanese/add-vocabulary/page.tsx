"use client";

import { VERB_TYPES } from "@/lib/japanese/conjugation";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import { useSnackbar } from "@/context/SnackbarContext";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";

interface Category {
  id: number;
  name: string;
}

export default function AddVocabularyPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [english, setEnglish] = useState("");
  const [japanese, setJapanese] = useState("");
  const [hiragana, setHiragana] = useState("");
  const [selectedVerbType, setSelectedVerbType] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [starred, setStarred] = useState(false);
  const { showMessage } = useSnackbar();

  // Fetch categories from API
  useEffect(() => {
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
        if (data.categories.length > 0) setCategoryId(data.categories[0]?.id || null);
      } catch (err: unknown) {
        showMessage(`Failed to load categories: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    
    loadCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      showMessage("Please select a category before adding vocabulary.");
      return;
    }

    try {
      const res = await fetch("/api/japanese-practice/vocabulary/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          english,
          japanese,
          hiragana,
          categoryId,
          verbType: selectedVerbType,
          starred,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success !== true) {
        const message = [data?.error, data?.message].find(
          (value) => typeof value === "string" && value.trim()
        );
        const fallback = res.status === 401 || res.status === 403
          ? "Your session may have expired. Please sign in again."
          : `The server could not save this vocabulary (HTTP ${res.status}). Please try again.`;
        showMessage(`Unable to add vocabulary: ${message || fallback}`);
        return;
      }

      showMessage("Vocabulary added successfully!");
      setEnglish("");
      setJapanese("");
      setHiragana("");
      setCategoryId(categories[0]?.id || null);
      setSelectedVerbType(null);
      setStarred(false);
    } catch {
      showMessage("Unable to add vocabulary. Could not reach the server. Check your connection and try again.");
    }
  };

  return (
    <div
      className="flex items-center justify-center mt-30"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div
        className="relative w-full max-w-lg rounded-xl p-8 space-y-6"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-card-border)",
        }}
      >
        {/* Back button */}
        <div className="flex justify-start">
          <Link
            href="/japanese/vocabulary"
              className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer mr-4"
          >
            <ArrowLeftIcon className="w-5 h-5" /> Back
          </Link>
        </div>

        <div className="flex items-center justify-center gap-2">
          <h2
            className="text-2xl font-bold"
            style={{ color: "var(--color-foreground)" }}
          >
            Add New Vocabulary
          </h2>

          <button onClick={() => setStarred(!starred)}>
            {starred ? (
              <StarSolidIcon className="w-6 h-6 text-yellow-400" />
            ) : (
              <StarOutlineIcon className="w-6 h-6 text-gray-400" />
            )}
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block mb-1">English:</label>
            <input
              type="text"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              required
              autoFocus
              autoComplete="off"
              className="w-full border rounded px-3 py-2 focus:outline-none"
              style={{
                borderColor: "var(--color-card-border)",
                backgroundColor: "var(--color-card-bg)",
                color: "var(--color-foreground)",
              }}
            />
          </div>

          <div>
            <label className="block mb-1">Japanese:</label>
            <input
              type="text"
              value={japanese}
              onChange={(e) => setJapanese(e.target.value)}
              required
              autoComplete="off"
              className="w-full border rounded px-3 py-2 focus:outline-none"
              style={{
                borderColor: "var(--color-card-border)",
                backgroundColor: "var(--color-card-bg)",
                color: "var(--color-foreground)",
              }}
            />
          </div>

          <div>
            <label className="block mb-1">Hiragana:</label>
            <input
              type="text"
              value={hiragana}
              onChange={(e) => setHiragana(e.target.value)}
              required
              autoComplete="off"
              className="w-full border rounded px-3 py-2 focus:outline-none"
              style={{
                borderColor: "var(--color-card-border)",
                backgroundColor: "var(--color-card-bg)",
                color: "var(--color-foreground)",
              }}
            />
          </div>

          <div>
            <label className="block mb-1">Category:</label>
            <select
              value={categoryId ?? ""}
              onChange={(e) => {setCategoryId(Number(e.target.value)); setSelectedVerbType(null);}}
              required
              className="w-full border rounded px-3 py-2 focus:outline-none"
              style={{
                borderColor: "var(--color-card-border)",
                backgroundColor: "var(--color-card-bg)",
                color: "var(--color-foreground)",
              }}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {categories.find((cat) => cat.id === categoryId)?.name.trim().toLowerCase() === "verb" && (
            <div className="mt-4">
              <label className="block mb-2">Verb Ending Type:</label>
              <div className="flex flex-wrap gap-4">
                {VERB_TYPES.map((verbType) => (
                  <label key={verbType.value} className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="verbType"
                      value={verbType.value}
                      checked={selectedVerbType === verbType.value}
                      onChange={(e) => setSelectedVerbType(e.target.value)}
                      className="accent-blue-500"
                    />
                    <span>{verbType.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-center mt-4">
            <button
              type="submit"
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
            >
              Add Vocabulary
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
