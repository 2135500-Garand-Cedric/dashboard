export type FormatKind = "heading" | "bold" | "code" | "checklist";
export function formatInsertion(kind: FormatKind, selected = "") {
  const prefix = { heading: "## ", bold: "**", code: "\n```\n", checklist: "- " }[kind];
  const suffix = { heading: "", bold: "**", code: "\n```\n", checklist: "" }[kind];
  return { value: prefix + selected + suffix, caret: prefix.length + selected.length };
}
