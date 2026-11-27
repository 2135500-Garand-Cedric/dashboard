export function categoryKind(category: { kind?: string; name: string } | null | undefined) {
  if (category?.kind) return category.kind;
  const name = category?.name.trim().toLowerCase();
  return name === "verb" ? "VERB" : name === "kanji" ? "KANJI" : "OTHER";
}
