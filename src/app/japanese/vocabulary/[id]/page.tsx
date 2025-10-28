"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PencilSquareIcon, CheckIcon, TrashIcon, ArrowLeftIcon } from "@heroicons/react/24/solid";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { useSnackbar } from "@/context/SnackbarContext";

type Vocabulary = {
  id: number;
  english: string;
  japanese: string;
  hiragana: string;
  worst_status: string;
  percentage: string;
  categoryId: number;
  starred: boolean;
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
      console.log(vocabData);
      setVocab(vocabData);
      setEnglishDraft(vocabData.english);
      setJapaneseDraft(vocabData.japanese);
      setHiraganaDraft(vocabData.hiragana);
      setCategoryDraft(vocabData.categoryId);
      setStarredDraft(vocabData.starred);
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
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/japanese/vocabulary")}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer mr-4"
          >
            <ArrowLeftIcon className="w-5 h-5" /> Back
          </button>

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

          <div className="flex gap-2 ml-4">
            <button
              onClick={async () => {
                if (editMode) await saveVocabulary();
                setEditMode(!editMode);
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
        </div>
      </div>
    </div>
  );
}
