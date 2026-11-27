"use client";
import { useCapability } from "@/context/AccessContext";
import { categoryKind } from "@/lib/japanese/category-kind";

import VocabularyReadingsInput from "@/components/VocabularyReadingsInput";
import { vocabularyReadings } from "@/lib/japanese/readings";
import { VERB_TYPES } from "@/lib/japanese/conjugation";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PencilSquareIcon, CheckIcon, TrashIcon, ArrowLeftIcon } from "@heroicons/react/24/solid";
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
  readings?: string[];
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
  kind?: string;
};

function KanjiImage({ japanese }: { japanese: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="flex h-[150px] w-[150px] items-center justify-center rounded border border-gray-300 bg-gray-50 text-sm text-gray-500">
      Not Found
    </div>
  ) : (
    <img
      src={`/kanji/${japanese}.gif`}
      alt={japanese}
      width={150}
      height={150}
      className="border rounded"
      onError={() => setFailed(true)}
    />
  );
}

export default function VocabularyEditPage() {
  const canManage = useCapability("japanese.vocabulary.manage");
  const params = useParams();
  const vocabId = Number(params.id);
  const router = useRouter();
  const { showMessage } = useSnackbar();

  const [vocab, setVocab] = useState<Vocabulary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [englishDraft, setEnglishDraft] = useState("");
  const [japaneseDraft, setJapaneseDraft] = useState("");
  const [readingsDraft, setReadingsDraft] = useState<string[]>([""]);
  const [categoryDraft, setCategoryDraft] = useState<number | "">("");
  const [starredDraft, setStarredDraft] = useState(false);
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
      setReadingsDraft(vocabularyReadings(vocabData));
      setCategoryDraft(vocabData.categoryId);
      setStarredDraft(vocabData.starred);
      setSelectedVerbType(vocabData.verbType);
    } catch (err: unknown) {
      showMessage(`Failed to load vocabulary: ${err instanceof Error ? err.message : String(err)}`);
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
    } catch (err: unknown) {
      console.error("Unexpected error loading categories:", err);
      showMessage(`Failed to load categories: ${err instanceof Error ? err.message : String(err)}`);
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
          hiragana: readingsDraft[0],
          readings:
            categoryKind(categories.find((c) => c.id === categoryDraft)) === "KANJI"
              ? readingsDraft
              : readingsDraft.slice(0, 1),
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
    } catch (err: unknown) {
      showMessage(
        `Failed to update vocabulary: ${err instanceof Error ? err.message : String(err)}`,
      );
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
    <div className="flex flex-col items-center gap-4 px-0 py-4 md:flex-row md:items-stretch md:justify-center md:gap-0 md:px-4 md:py-8">
      <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 shadow md:p-6">
        {/* Header */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 md:flex-nowrap md:gap-0">
          <button
            onClick={() => router.push("/japanese/vocabulary")}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer mr-4"
          >
            <ArrowLeftIcon className="w-5 h-5" /> Back
          </button>

          <div className="flex flex-wrap gap-2 md:ml-4 md:flex-nowrap">
            <button
              disabled={!canManage}
              onClick={async () => {
                if (!canManage) return;
                if (editMode) await saveVocabulary();
                else setEditMode(true);
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

            {canManage && !editMode && (
              <button
                onClick={deleteVocabulary}
                className="flex items-center gap-1 border rounded px-3 py-1 transition hover:bg-red-100 hover:text-red-600 cursor-pointer"
              >
                <TrashIcon className="w-5 h-5" />
                Delete
              </button>
            )}

            {editMode && (
              <button
                type="button"
                onClick={() => {
                  setEnglishDraft(vocab.english);
                  setJapaneseDraft(vocab.japanese);
                  setReadingsDraft(vocabularyReadings(vocab));
                  setCategoryDraft(vocab.categoryId);
                  setStarredDraft(vocab.starred);
                  setSelectedVerbType(vocab.verbType);
                  setEditMode(false);
                }}
                className="flex items-center gap-1 rounded border px-3 py-1 hover:bg-gray-100 hover:text-black"
              >
                Cancel
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
              <VocabularyReadingsInput
                values={readingsDraft}
                onChange={setReadingsDraft}
                multiple={categoryKind(categories.find((c) => c.id === categoryDraft)) === "KANJI"}
              />
            ) : (
              <p>{vocabularyReadings(vocab).join(" / ")}</p>
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
          {categoryKind(categories.find((c) => c.id === categoryDraft)) === "VERB" && (
            <div>
              <label className="block text-sm text-gray-500 mb-1">Verb Type</label>

              {editMode ? (
                <div className="flex flex-wrap gap-4">
                  {VERB_TYPES.map((verb) => (
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
                  {VERB_TYPES.find((type) => type.value === vocab.verbType)?.label ??
                    "No verb type selected"}
                </p>
              )}
            </div>
          )}
          {/* Kanji gif (only if category is Kanji) */}
          {typeof window !== "undefined" &&
            categoryKind(categories.find((c) => c.id === vocab.categoryId)) === "KANJI" && (
              <div className="mt-2">
                <KanjiImage key={vocab.japanese} japanese={vocab.japanese} />
              </div>
            )}
        </div>
      </div>

      {/* Verb Forms Modal */}
      {categoryKind(categories.find((c) => c.id === vocab.categoryId)) === "VERB" && (
        <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 shadow md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Verb Forms</h2>
            {!vocab.verbForms?.length && (
              <p className="mt-2 text-sm text-gray-400">No conjugated forms available.</p>
            )}
          </div>

          <div aria-label="Verb form cards" className="space-y-3 md:hidden">
            {(vocab.verbForms ?? []).map((vf) => {
              const status = vf.worst_status.toLowerCase();
              const color =
                status === "perfect"
                  ? "border-emerald-500/40 text-emerald-400"
                  : status === "good"
                    ? "border-amber-400/40 text-amber-300"
                    : "border-rose-500/40 text-rose-400";
              const percent = Math.min(100, Math.max(0, parseFloat(vf.percentage) || 0));
              return (
                <article
                  key={vf.id}
                  className={`min-w-0 rounded-xl border bg-card-bg p-3 ${color}`}
                >
                  <div className="flex items-start justify-between gap-3 text-sm font-medium">
                    <h3 className="min-w-0 break-words text-foreground">{vf.formType}</h3>
                    <span className="shrink-0">{percent.toFixed(2)}%</span>
                  </div>
                  <p lang="ja" className="mt-2 break-words text-xl text-foreground">
                    {vf.form}
                  </p>
                  <p
                    lang="ja"
                    className="mt-1 break-words text-sm text-gray-500 dark:text-gray-400"
                  >
                    {vf.reading}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-foreground/10" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-current"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          <table className="hidden w-full table-auto border-collapse md:table">
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
              {(vocab.verbForms ?? []).map((vf) => {
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
