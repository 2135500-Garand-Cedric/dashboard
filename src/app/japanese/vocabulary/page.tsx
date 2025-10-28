"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSnackbar } from "@/context/SnackbarContext";
import { StarIcon as SolidStarIcon } from "@heroicons/react/24/solid";
import { StarIcon as OutlineStarIcon } from "@heroicons/react/24/outline";

interface Category {
  id: number;
  name: string;
}

interface Vocabulary {
  id: number;
  english: string;
  japanese: string;
  hiragana: string;
  worst_status: string;
  percentage: string;
  category_name: string;
  starred: boolean;
}

export default function VocabularyPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [starredSort, setStarredSort] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const { showMessage } = useSnackbar();

  // Fetch categories and vocabulary
  useEffect(() => {
    async function fetchData() {
      const [vocabRes] = await Promise.all([
        fetch("/api/japanese-practice/vocabulary"),
      ]);

      const vocab: Vocabulary[] = await vocabRes.json();
      setVocabulary(vocab);
    }

    async function loadCategories() {
      try {
        const res = await fetch("/api/japanese-practice/categories");
        if (!res.ok) {
          showMessage(`Failed to fetch categories: ${res.statusText}`);
          return;
        }

        const data = await res.json();
        if (!data.success || !data.categories) {
          showMessage("Failed to load categories: Invalid response");
          return;
        }

        setCategories(data.categories);
      } catch (err: any) {
        showMessage(`Failed to load categories: ${err.message || err}`);
      }
    }

    fetchData();
    loadCategories();
  }, []);

  const handleCheckbox = (id: number) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const filteredVocab = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();

    let filtered = vocabulary.filter((v) => {
      const matchesSearch =
        v.english.toLowerCase().includes(lowerSearch) ||
        v.japanese.toLowerCase().includes(lowerSearch) ||
        v.hiragana.toLowerCase().includes(lowerSearch);

      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(
          categories.find((c) => c.name === v.category_name)?.id || -1
        );

      return matchesSearch && matchesCategory;
    });

    if (starredSort) {
      filtered.sort((a, b) => Number(b.starred) - Number(a.starred));
    } else {
      filtered.sort((a, b) => a.english.localeCompare(b.english));
    }

    return filtered;
  }, [vocabulary, search, selectedCategories, categories, starredSort]);

  const averagePercentage = useMemo(() => {
    if (!filteredVocab.length) return "0.0%";
    const total = filteredVocab.reduce((sum, v) => sum + parseFloat(v.percentage), 0);
    return (total / filteredVocab.length).toFixed(2) + "%";
  }, [filteredVocab]);

  return (
    <div className="p-6" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="flex justify-end space-x-2 mb-4">
        <Link
          href="/japanese/practice"
          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
        >
          Start Practice
        </Link>
        <Link
          href="/japanese/categories"
          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
        >
          Manage Categories
        </Link>
        <Link
          href="/japanese/add-vocabulary"
          className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
        >
          Add Vocabulary
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--color-foreground)" }}>
        Vocabulary List
      </h1>
      <h2 className="text-xl mb-4" style={{ color: "var(--color-foreground)" }}>
        Average: {averagePercentage}
      </h2>

      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mb-4 gap-2">
        <input
          type="text"
          placeholder="Search English word..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 w-full sm:w-1/3 focus:outline-none"
          style={{
            borderColor: "var(--color-card-border)",
            backgroundColor: "var(--color-card-bg)",
            color: "var(--color-foreground)",
          }}
        />

        <div className="flex flex-wrap gap-2">
          {/* ✅ Categories checkboxes */}
          {categories.map((cat) => (
            <label
              key={cat.id}
              className="flex items-center space-x-1 px-2 py-1 border rounded cursor-pointer"
              style={{ borderColor: "var(--color-card-border)" }}
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

          {/* ✅ Starred sort checkbox */}
          <label
            className="flex items-center space-x-1 px-2 py-1 border rounded cursor-pointer"
            style={{ borderColor: "var(--color-card-border)" }}
          >
            <input
              type="checkbox"
              checked={starredSort}
              onChange={() => setStarredSort((prev) => !prev)}
              className="accent-yellow-500"
            />
            <span>Starred</span>
          </label>
        </div>
      </div>

      <div className={`overflow-x-auto ${filteredVocab.length > 15 ? "overflow-y-auto max-h-[650px]" : ""}`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              {["", "English", "Japanese", "Hiragana", "Status", "Percentage", "Category"].map((head, idx) => (
                <th
                  key={idx}
                  className="border-b px-4 py-2"
                  style={{ borderColor: "var(--color-card-border)" }}
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredVocab.map((v, i) => {
              let statusColor = "bg-gray-400";
              if (v.worst_status.toLowerCase() === "perfect") statusColor = "bg-green-500";
              else if (v.worst_status.toLowerCase() === "good") statusColor = "bg-yellow-400";
              else if (v.worst_status.toLowerCase() === "weak") statusColor = "bg-red-500";

              return (
                <tr
                  key={i}
                  className="hover:bg-gray-100 cursor-pointer"
                  style={{ backgroundColor: "var(--color-card-bg)" }}
                  onClick={() => window.location.href = `/japanese/vocabulary/${v.id}`}
                >
                  {/* ✅ Star column */}
                  <td className="px-2 py-2">
                    {v.starred ? (
                      <SolidStarIcon className="w-5 h-5 text-yellow-400 inline-block" />
                    ) : (
                      <OutlineStarIcon className="w-5 h-5 text-gray-400 inline-block" />
                    )}
                  </td>
                  <td className="px-4 py-2">{v.english}</td>
                  <td className="px-4 py-2">{v.japanese}</td>
                  <td className="px-4 py-2">{v.hiragana}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${statusColor}`}
                      title={v.worst_status}
                    ></span>
                  </td>
                  <td className="px-4 py-2">{v.percentage}</td>
                  <td className="px-4 py-2">{v.category_name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
