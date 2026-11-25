export const SEARCH_KINDS = [
  "tasks",
  "projects",
  "knowledge",
  "calendar",
  "finance",
  "people",
  "vocabulary",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];
export const SEARCH_LABELS: Record<SearchKind, string> = {
  tasks: "Tasks",
  projects: "Projects",
  knowledge: "Knowledge",
  calendar: "Calendar",
  finance: "Finance",
  people: "People",
  vocabulary: "Japanese vocabulary",
};
export type SearchInput = {
  query: string;
  kind: SearchKind | "all";
  includeArchived: boolean;
  view: "dialog" | "page";
  page: number;
};
export type SearchResult = {
  key: string;
  kind: SearchKind;
  entity: string;
  id: number;
  title: string;
  href: string;
  subtitle: string;
  snippet: string;
  badges: string[];
  color?: string;
};
export type SearchGroup = {
  kind: SearchKind;
  items: SearchResult[];
  hasMore: boolean;
  page: number;
  error?: string;
};
export type SearchResponse = { groups: SearchGroup[] };

export class SearchValidationError extends Error {}
export function searchReady(query: string) {
  const text = query.normalize("NFC").trim();
  return [...text].length >= 2 || /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u.test(text);
}
export function searchInput(value: unknown): SearchInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SearchValidationError("Enter a valid search.");
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["query", "kind", "includeArchived", "view", "page"].includes(key),
    ) ||
    typeof body.query !== "string" ||
    [...body.query].length > 120 ||
    /[\u0000-\u001f\u007f]/u.test(body.query)
  )
    throw new SearchValidationError("Search using up to 120 characters.");
  const query = body.query.normalize("NFC").trim().replace(/\s+/g, " ");
  const kind = body.kind ?? "all",
    view = body.view ?? "dialog",
    page = body.page ?? 1;
  if (
    (kind !== "all" && !SEARCH_KINDS.includes(kind as SearchKind)) ||
    !["dialog", "page"].includes(String(view)) ||
    (body.includeArchived !== undefined && typeof body.includeArchived !== "boolean") ||
    !Number.isInteger(page) ||
    Number(page) < 1 ||
    Number(page) > 200 ||
    (view === "page" && kind === "all") ||
    (view === "dialog" && page !== 1)
  )
    throw new SearchValidationError("Choose valid search filters.");
  return {
    query,
    kind: kind as SearchInput["kind"],
    view: view as SearchInput["view"],
    includeArchived: body.includeArchived === true,
    page: Number(page),
  };
}
export function canonicalQuery(query: string) {
  const reference = /^(TASK|PROJECT)-0*([1-9]\d*)$/i.exec(query);
  if (reference && Number(reference[2]) <= 2147483647)
    return `${reference[1].toUpperCase()}-${reference[2].padStart(4, "0")}`;
  return query;
}
export const SEARCH_SHORTCUTS = [
  { title: "My Work", href: "/my-work" },
  { title: "Calendar", href: "/events" },
  { title: "Knowledge", href: "/knowledge" },
  { title: "Finance", href: "/finance" },
  { title: "Japanese vocabulary", href: "/japanese/vocabulary" },
  { title: "People", href: "/settings/people" },
  { title: "Settings", href: "/settings" },
  { title: "Weekly report", href: "/weekly-report" },
];
