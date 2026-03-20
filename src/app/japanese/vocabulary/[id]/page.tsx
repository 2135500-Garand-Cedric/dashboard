"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PencilSquareIcon, CheckIcon, TrashIcon, ArrowLeftIcon, Bars3Icon } from "@heroicons/react/24/solid";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { useSnackbar } from "@/context/SnackbarContext";

type VerbForm = {
  id: number;
  formType: string;
  form: string;
  reading: string;     
  worst_status: string;
  percentage: string;
};

type Vocabulary = {
  id: number;
  english: string;
  japanese: string;
  hiragana: string;
  worst_status: string;
  percentage: string;
  categoryId: number;
  starred: boolean;
  verbType: string | null;
  verbForms?: VerbForm[];
};

type Category = {
  id: number;
  name: string;
};

export default function VocabularyEditPage() {
  const params = useParams();
  const vocabId = Number(params.id);
  const router = useRouter();
  const { showMessage } = useSnackbar();

  const [vocab, setVocab] = useState<Vocabulary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [englishDraft, setEnglishDraft] = useState("");
  const [japaneseDraft, setJapaneseDraft] = useState("");
  const [hiraganaDraft, setHiraganaDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<number | "">("");
  const [starredDraft, setStarredDraft] = useState(false);
  const [showVerbForms, setShowVerbForms] = useState(false);
  const [selectedVerbType, setSelectedVerbType] = useState<string | null>(null);

  const loadVocabulary = async () => {
    try {
      const res = await fetch(`/api/japanese-practice/vocabulary/${vocabId}`);
      if (!res.ok) {
        showMessage(`Failed to fetch vocabulary: ${res.statusText}`);
        return;
      }

      const data = await res.json();
      if (!data.success || !data.vocabulary) {
        showMessage("Error in API response or vocabulary not found.");
        return;
      }

      const vocabData = data.vocabulary;
      setVocab(vocabData);
      setEnglishDraft(vocabData.english);
      setJapaneseDraft(vocabData.japanese);
      setHiraganaDraft(vocabData.hiragana);
      setCategoryDraft(vocabData.categoryId);
      setStarredDraft(vocabData.starred);
      setSelectedVerbType(vocabData.verbType);
    } catch (err: any) {
      showMessage(`Failed to load vocabulary: ${err.message || err}`);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetch(`/api/japanese-practice/categories`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const errorMsg = data?.error || res.statusText || "Unknown error";
        console.error("Load categories error:", errorMsg);
        showMessage(`Failed to load categories: ${errorMsg}`);
        return;
      }
      setCategories(data.categories || []);
    } catch (err: any) {
      console.error("Unexpected error loading categories:", err);
      showMessage(`Failed to load categories: ${err.message || err}`);
    }
  };

  useEffect(() => {
    loadVocabulary();
    loadCategories();
  }, [vocabId]);

  if (!vocab) return <div className="text-center py-10">Loading...</div>;

  const saveVocabulary = async () => {
    try {
      const res = await fetch(`/api/japanese-practice/vocabulary/${vocabId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          english: englishDraft,
          japanese: japaneseDraft,
          hiragana: hiraganaDraft,
          categoryId: categoryDraft,
          starred: starredDraft,
          verbType: selectedVerbType,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showMessage(`Failed to update vocabulary: ${data.error || res.statusText}`);
        return;
      }

      setEditMode(false);
      await loadVocabulary();
      showMessage("Vocabulary updated successfully!");
    } catch (err: any) {
      showMessage(`Failed to update vocabulary: ${err.message || err}`);
    }
  };

  const deleteVocabulary = async () => {
    if (confirm("Are you sure you want to delete this vocabulary?")) {
      const res = await fetch(`/api/japanese-practice/vocabulary/${vocabId}`, { method: "DELETE" });
      if (res.ok) {
        showMessage("Vocabulary deleted successfully!");
        router.push("/japanese/vocabulary");
      }
    }
  };

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => router.push("/japanese/vocabulary")}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer mr-4"
          >
            <ArrowLeftIcon className="w-5 h-5" /> Back
          </button>

          <div className="flex gap-2 ml-4">
            <button
              onClick={async () => {
                if (editMode) await saveVocabulary();
                setEditMode(!editMode);
                setShowVerbForms(false);
              }}
              className="flex items-center gap-1 border rounded px-3 py-1 hover:bg-gray-100 hover:text-black cursor-pointer"
            >
              {editMode ? (
                <>
                  <CheckIcon className="w-5 h-5 text-green-600" />
                  Save
                </>
              ) : (
                <>
                  <PencilSquareIcon className="w-5 h-5" />
                  Edit
                </>
              )}
            </button>

            {!editMode && (
              <button
                onClick={deleteVocabulary}
                className="flex items-center gap-1 border rounded px-3 py-1 transition hover:bg-red-100 hover:text-red-600 cursor-pointer"
              >
                <TrashIcon className="w-5 h-5" />
                Delete
              </button>
            )}

            {!editMode && vocab.categoryId && categories.find(c => c.id === vocab.categoryId)?.name.toLowerCase() === "verb" && (
              <button
                onClick={() => setShowVerbForms(!showVerbForms)}
                className="flex items-center gap-1 border rounded px-3 py-1 hover:bg-gray-100 hover:text-black cursor-pointer"
              >
                <Bars3Icon className="w-5 h-5" />
                Forms
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 flex justify-center items-center gap-2">
          {editMode ? (
            <>
              <input
                value={englishDraft}
                onChange={(e) => setEnglishDraft(e.target.value)}
                className="text-lg font-semibold border rounded px-3 py-1 flex-1 text-center"
              />
              <button onClick={() => setStarredDraft(!starredDraft)} className="ml-2">
                {starredDraft ? (
                  <StarSolidIcon className="w-6 h-6 text-yellow-400" />
                ) : (
                  <StarOutlineIcon className="w-6 h-6 text-gray-400" />
                )}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{vocab.english}</h1>
              {vocab.starred ? (
                <StarSolidIcon className="w-6 h-6 text-yellow-400" />
              ) : (
                <StarOutlineIcon className="w-6 h-6 text-gray-400" />
              )}
            </div>
          )}
          </div>

        </div>

        {/* Details */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Japanese</label>
            {editMode ? (
              <input
                value={japaneseDraft}
                onChange={(e) => setJapaneseDraft(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            ) : (
              <p>{vocab.japanese}</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Hiragana</label>
            {editMode ? (
              <input
                value={hiraganaDraft}
                onChange={(e) => setHiraganaDraft(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            ) : (
              <p>{vocab.hiragana}</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Status</label>
            <p>{vocab.worst_status}</p>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Percentage</label>
            <p>{vocab.percentage}</p>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Category</label>
            {editMode ? (
              <select
                value={categoryDraft}
                onChange={(e) => setCategoryDraft(Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
                style={{
                  backgroundColor: "var(--card-bg)",
                  color: "var(--foreground)",
                  borderColor: "var(--card-border)",
                }}
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            ) : (
              <p>{categories.find((c) => c.id === vocab.categoryId)?.name || "Unknown"}</p>
            )}
          </div>
          {/* Verb Type (only if category is verb) */}
          {categories.find((cat) => cat.id === categoryDraft)?.name.toLowerCase() === "verb" && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Verb Type</label>

              {editMode ? (
                <div className="flex flex-wrap gap-4">
                  {[
                    { label: "U-verb", value: "u" },
                    { label: "Ru-verb", value: "ru" },
                    { label: "する-verb", value: "suru" },
                    { label: "来る-verb", value: "kuru" },
                  ].map((verb) => (
                    <label key={verb.value} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="verbType"
                        value={verb.value}
                        checked={selectedVerbType === verb.value}
                        onChange={(e) => setSelectedVerbType(e.target.value)}
                        className="accent-blue-500"
                      />
                      <span>{verb.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p>
                  {(() => {
                    const mapping = {
                      u: "U-verb",
                      ru: "Ru-verb",
                      suru: "する-verb",
                      kuru: "来る-verb",
                    };
                    return vocab.verbType ? mapping[vocab.verbType as keyof typeof mapping] : "No verb type selected";
                  })()}
                </p>
              )}
            </div>
          )}
          {/* Kanji gif (only if category is Kanji) */}
          {typeof window !== "undefined" && categories.find((c) => c.id === vocab.categoryId)?.name === "Kanji" && (
            <div className="mt-2">
              <img
                src={`/kanji/${vocab.japanese}.gif`}
                alt={vocab.japanese}
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
          )}
        </div>
      </div>

      {/* Verb Forms Modal */}
      {showVerbForms && vocab.verbForms && vocab.verbForms.length > 0 && (
        <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Verb Forms</h2>
          </div>

          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="text-left border-b border-[var(--card-border)]">
                <th className="px-2 py-1">Form Name</th>
                <th className="px-2 py-1">Form</th>
                <th className="px-2 py-1">Reading</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {vocab.verbForms.map((vf) => {
                let statusColor = "bg-gray-400";

                if (vf.worst_status.toLowerCase() === "perfect") {
                  statusColor = "bg-green-500";
                } else if (vf.worst_status.toLowerCase() === "good") {
                  statusColor = "bg-yellow-400";
                } else if (vf.worst_status.toLowerCase() === "weak") {
                  statusColor = "bg-red-500";
                }

                return (
                  <tr key={vf.id} className="border-b border-[var(--card-border)]">
                    <td className="px-2 py-1">{vf.formType}</td>
                    <td className="px-2 py-1">{vf.form}</td>
                    <td className="px-2 py-1">{vf.reading}</td>
                    <td className="px-2 py-1">
                      <span
                        className={`inline-block w-3 h-3 rounded-full ${statusColor}`}
                        title={vf.worst_status}
                      ></span>
                    </td>
                    <td className="px-2 py-1">{vf.percentage}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
