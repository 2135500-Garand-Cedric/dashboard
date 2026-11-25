"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SEARCH_KINDS, type SearchKind } from "@/lib/search/types";
import { useSearch } from "./SearchProvider";
import SearchContent from "./SearchContent";

export default function SearchPage() {
  const params = useSearchParams(),
    type = params.get("type");
  const { setKind, open } = useSearch();
  useEffect(() => {
    if (type && SEARCH_KINDS.includes(type as SearchKind)) setKind(type as SearchKind);
  }, [type, setKind]);
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pt-12 md:pt-2">
      <h1 className="text-2xl font-bold">Search dashboard</h1>
      <div className="card min-w-0">
        <SearchContent expanded active={!open} />
      </div>
    </div>
  );
}
