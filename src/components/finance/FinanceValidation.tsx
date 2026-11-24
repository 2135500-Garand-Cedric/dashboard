"use client";

import { type ReactNode, type FormEvent } from "react";
import { useSnackbar } from "@/context/SnackbarContext";

// Native required-field validation happens before submit handlers run. Capture
// it here so every finance form reports the first invalid field in the snackbar.
export default function FinanceValidation({ children }: { children: ReactNode }) {
  const { showMessage } = useSnackbar();
  function invalid(event: FormEvent<HTMLDivElement>) {
    const field = event.target;
    if (
      !(field instanceof HTMLInputElement) &&
      !(field instanceof HTMLSelectElement) &&
      !(field instanceof HTMLTextAreaElement)
    )
      return;
    event.preventDefault();
    const first = field.form?.querySelector("input:invalid, select:invalid, textarea:invalid");
    if (first && field !== first) return;
    const label = field.labels?.[0];
    const labelText =
      label &&
      Array.from(label.childNodes)
        .filter((node) => !(node instanceof HTMLElement && node.matches("input, select, textarea")))
        .map((node) => node.textContent)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    const name = field.getAttribute("aria-label") || labelText || field.name || "This field";
    showMessage(
      field.validity.valueMissing ? `${name} is required.` : `${name}: ${field.validationMessage}`,
    );
    field.focus();
  }
  return (
    <div className="contents" onInvalidCapture={invalid}>
      {children}
    </div>
  );
}
