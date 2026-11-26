"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkContact } from "@/lib/work-management/types";
import { workRead } from "@/lib/work-management/client";
import { useSnackbar } from "@/context/SnackbarContext";
import { fieldClass } from "@/components/finance/shared";

export default function PersonSelect({
  value,
  currentName,
  onChange,
  disabled,
}: {
  value: string;
  currentName?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [people, setPeople] = useState<WorkContact[]>([]);
  const [loading, setLoading] = useState(true);
  const message = useRef(useSnackbar().showMessage);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const items = new Map<number, WorkContact>();
        for (let page = 1; active; page++) {
          const data = await workRead<{ items: WorkContact[]; total: number; pageSize: number }>(
            `/api/work-contacts?page=${page}`,
          );
          for (const person of data.items) items.set(person.id, person);
          if (!data.items.length || page * data.pageSize >= data.total) break;
        }
        if (active) setPeople([...items.values()]);
      } catch (failure) {
        if (active)
          message.current(failure instanceof Error ? failure.message : "Unable to load people.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        Who will reimburse you?
        <select
          aria-label="Reimbursement person"
          required
          disabled={disabled || loading}
          className={fieldClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{loading ? "Loading people…" : "Choose a person"}</option>
          {currentName && value && !people.some((person) => person.id === Number(value)) && (
            <option value={value}>{currentName}</option>
          )}
          {people
            .filter((person) => person.active || person.id === Number(value))
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.company ? ` · ${person.company}` : ""}
                {person.active ? "" : " (inactive)"}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
