// Only server-owned SQL fragments are composed here. All request values are bound
// separately, including owner, query, archive flag, limit, offset and dates.
export const argumentsSQL = `WITH RECURSIVE args AS (
  SELECT $1::integer AS owner, normalize(lower($2::text), NFC) AS q,
    $3::boolean AS archived, $4::integer AS take, $5::integer AS skip,
    $6::boolean AS collapse, $7::text AS today, $8::timestamptz AS now
)`;
export const resultsSQL = `, matched AS (
  SELECT r.*, CASE
    WHEN normalize(lower(r.title), NFC)=a.q OR lower(r.reference)=a.q THEN 0
    WHEN starts_with(normalize(lower(r.title), NFC),a.q) THEN 1
    WHEN strpos(normalize(lower(r.title), NFC),a.q)>0 THEN 2
    WHEN strpos(normalize(lower(r.structured), NFC),a.q)>0 THEN 3 ELSE 4 END AS rank
  FROM records r CROSS JOIN args a
  WHERE (a.archived OR NOT r.archived) AND (
    lower(r.reference)=a.q OR strpos(normalize(lower(r.title || ' ' || r.structured || ' ' || r.body),NFC),a.q)>0
    OR (strpos(a.q,'%')=0 AND strpos(a.q,'_')=0 AND strpos(a.q,chr(92))=0
      AND to_tsvector('simple',r.title || ' ' || r.structured || ' ' || r.body) @@ plainto_tsquery('simple',a.q))
  )
), grouped AS (
  SELECT m.*, row_number() OVER (
    PARTITION BY entity, coalesce('series-'||"recurrenceId"::text, 'id-'||id::text)
    ORDER BY CASE WHEN occurrence >= (SELECT today FROM args) THEN 0 ELSE 1 END,
      CASE WHEN occurrence >= (SELECT today FROM args) THEN occurrence END ASC,
      occurrence DESC NULLS LAST, id ASC
  ) AS occurrence_rank FROM matched m
)
SELECT id,entity,title,reference,archived,extra,rank,
  substring(body FROM greatest(1,strpos(normalize(lower(body),NFC),(SELECT q FROM args))-65) FOR 220) AS snippet,
  CASE WHEN rank=3 THEN 'Related: ' || substring(structured FROM greatest(1,strpos(normalize(lower(structured),NFC),(SELECT q FROM args))-35) FOR 160) ELSE '' END AS reason
FROM grouped WHERE NOT (SELECT collapse FROM args) OR occurrence_rank=1
ORDER BY rank ASC, "sortAt" DESC, entity ASC, id DESC
LIMIT (SELECT take FROM args) OFFSET (SELECT skip FROM args)`;

export type SearchRow = {
  id: number;
  entity: string;
  title: string;
  reference: string;
  archived: boolean;
  rank: number;
  snippet: string;
  reason: string;
  extra: Record<string, unknown>;
};
