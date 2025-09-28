"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import { useSnackbar } from "@/context/SnackbarContext";

interface Category {
  id: number;
  name: string;
}

export default function AddVocabularyPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [english, setEnglish] = useState("");
  const [japanese, setJapanese] = useState("");
  const [hiragana, setHiragana] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const { showMessage } = useSnackbar();

  // Fetch categories from API
  useEffect(() => {
    async function fetchCategories() {
      const res = await fetch("/api/japanese-practice/categories");
      const data = await res.json();
      setCategories(data);
      if (data.length > 0) setCategoryId(data[0].id);
    }
    fetchCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) return;

    const res = await fetch("/api/japanese-practice/vocabulary/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ english, japanese, hiragana, categoryId }),
    });

    const data = await res.json();
    if (res.ok) {
      showMessage("Vocabulary added successfully!");
      setEnglish("");
      setJapanese("");
      setHiragana("");
      setCategoryId(categories[0]?.id || null);
    } else {
      showMessage("Error: " + data.message);
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

        <h2
          className="text-2xl font-bold text-center"
          style={{ color: "var(--color-foreground)" }}
        >
          Add New Vocabulary
        </h2>

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
              onChange={(e) => setCategoryId(Number(e.target.value))}
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
