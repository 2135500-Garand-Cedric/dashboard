"use client";

export default function VocabularyReadingsInput({ values, onChange, multiple }: { values: string[]; onChange: (values: string[]) => void; multiple: boolean }) {
  return <fieldset className="space-y-2">
    <legend className="mb-1">{multiple ? "Kanji readings" : "Hiragana"}</legend>
    {(multiple ? values : values.slice(0, 1)).map((value, index) => <div key={index} className="flex items-center gap-2">
      <input aria-label={`Reading ${index + 1}`} value={value} required autoComplete="off" lang="ja"
        onChange={event => onChange(values.map((reading, i) => i === index ? event.target.value : reading))}
        className="w-full min-w-0 rounded border border-card-border bg-card-bg px-3 py-2 text-foreground" />
      {multiple && values.length > 1 && <button type="button" aria-label={`Remove reading ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))} className="shrink-0 rounded border border-card-border px-3 py-2 hover:bg-rose-500/10">Remove</button>}
    </div>)}
    {multiple && <button type="button" onClick={() => onChange([...values, ""])} className="rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-blue-500/10">+ Add reading</button>}
  </fieldset>;
}
