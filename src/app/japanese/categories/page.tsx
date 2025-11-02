"use client";

import { useEffect, useState } from "react";
import {
  PencilSquareIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/solid";
import { useSnackbar } from "@/context/SnackbarContext";
import { useRouter } from "next/navigation";

type Category = {
  id: number;
  name: string;
  vocabularyCount: number;
};

export default function CategoriesPage() {
  const router = useRouter();
  const { showMessage } = useSnackbar();

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [starredCount, setStarredCount] = useState<number>(0);

  const loadStarredCount = async () => {
    try {
      const res = await fetch("/api/japanese-practice/vocabulary/starred");
      const data = await res.json();
      if (res.ok && data.success) {
        setStarredCount(data.count);
      } else {
        showMessage(`Failed to load starred count: ${data.error || res.statusText}`);
      }
    } catch (err: any) {
      showMessage(`Failed to load starred count: ${err.message || err}`);
    }
  };

  // Load categories with vocabulary count
  const loadCategories = async () => {
    try {
      const res = await fetch("/api/japanese-practice/categories");
      if (!res.ok) {
        showMessage(`Failed to load categories: ${res.statusText}`);
        return;
      }

      const data = await res.json();
      if (!data.success) {
        showMessage(`Error: ${data.error || "Unknown error"}`);
        return;
      }

      if (!Array.isArray(data.categories)) {
        showMessage("Invalid response format from server");
        return;
      }

      setCategories(data.categories);
    } catch (err: any) {
      console.error("Failed to load categories:", err);
      showMessage("An unexpected error occurred while loading categories");
    }
  };

  useEffect(() => {
    loadCategories();
    loadStarredCount();
  }, []);

  // Add new category
  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      showMessage("Category name cannot be empty");
      return;
    }

    try {
      const res = await fetch("/api/japanese-practice/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        showMessage(`Failed to add category: ${data.error || res.statusText}`);
        return;
      }

      setNewCategoryName("");
      await loadCategories();
      showMessage("Category added successfully");
    } catch (err: any) {
      console.error("Unexpected error adding category:", err);
      showMessage("An unexpected error occurred");
    }
  };

  // Save edited category
  const saveCategory = async (id: number) => {
    if (!editDraft.trim()) {
      showMessage("Category name cannot be empty");
      return;
    }

    try {
      const res = await fetch(`/api/japanese-practice/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDraft.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showMessage(`Failed to update category: ${data.error || res.statusText}`);
        return;
      }

      setEditId(null);
      setEditDraft("");
      await loadCategories();
      showMessage("Category updated");
    } catch (err: any) {
      console.error("Unexpected error updating category:", err);
      showMessage("An unexpected error occurred");
    }
  };

  // Delete category
  const deleteCategory = async (id: number, vocabCount: number) => {
    if (vocabCount > 0) {
      showMessage("Cannot delete category with words linked to it");
      return;
    }

    if (!confirm("Are you sure you want to delete this category?")) return;

    try {
      const res = await fetch(`/api/japanese-practice/categories/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showMessage(`Failed to delete category: ${data.error || res.statusText}`);
        return;
      }

      await loadCategories();
      showMessage("Category deleted");
    } catch (err: any) {
      console.error("Unexpected error deleting category:", err);
      showMessage("An unexpected error occurred");
    }
  };

  return (
    <div className="flex justify-center px-4 py-8">
      <div className="w-full max-w-3xl bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 shadow">
        {/* Header */}
        <div className="flex items-center justify-start mb-6">
          <button
            onClick={() => router.push("/japanese/vocabulary")}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 cursor-pointer mr-4"
          >
            <ArrowLeftIcon className="w-5 h-5" /> Back
          </button>
          <h1 className="text-xl font-semibold">
            Categories ({categories.reduce((sum, cat) => sum + cat.vocabularyCount, 0)}) 
          </h1>
        </div>

        {/* Add new category */}
        <div className="flex gap-2 mb-6">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name"
            className="flex-1 border rounded px-3 py-2 text-gray-900 bg-white"
          />
          <button
            onClick={addCategory}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
          >
            <PlusIcon className="w-5 h-5" />
            Add
          </button>
        </div>

        {/* Category list */}
        {categories.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No categories found
          </div>
        ) : (
          <ul className="space-y-2">
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="flex items-center justify-between border rounded px-4 py-2 bg-[var(--card-inner-bg)]"
              >
                {editId === cat.id ? (
                  <input
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="flex-1 border rounded px-2 py-1 text-white-900"
                  />
                ) : (
                  <span className="text-white-800">
                    {cat.name} ({cat.vocabularyCount})
                  </span>
                )}

                <div className="flex gap-2 ml-4">
                  {editId === cat.id ? (
                    <button
                      onClick={() => saveCategory(cat.id)}
                      className="flex items-center gap-1 border rounded px-3 py-1 hover:bg-gray-100 hover:text-black cursor-pointer"
                    >
                      <CheckIcon className="w-5 h-5 text-green-600" />
                      Save
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setEditId(cat.id);
                        setEditDraft(cat.name);
                      }}
                      className="flex items-center gap-1 border rounded px-3 py-1 hover:bg-gray-100 hover:text-black cursor-pointer"
                    >
                      <PencilSquareIcon className="w-5 h-5" />
                      Edit
                    </button>
                  )}

                  <button
                    onClick={() => deleteCategory(cat.id, cat.vocabularyCount)}
                    className="flex items-center gap-1 border rounded px-3 py-1 hover:bg-red-100 hover:text-red-600 cursor-pointer"
                  >
                    <TrashIcon className="w-5 h-5" />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="text-white-700 font-medium mt-6">
          Starred words: {starredCount}
        </div>
      </div>
    </div>
  );
}
