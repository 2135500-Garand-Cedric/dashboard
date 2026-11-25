export const knowledgeSQL = `, folders AS (
  SELECT f.id,f.name::text AS path,f."archivedAt" IS NOT NULL AS archived,ARRAY[f.id] AS seen
  FROM "KnowledgeFolder" f CROSS JOIN args a WHERE f."userId"=a.owner AND f."parentId" IS NULL
  UNION ALL
  SELECT f.id,p.path||' / '||f.name,p.archived OR f."archivedAt" IS NOT NULL,p.seen||f.id
  FROM "KnowledgeFolder" f JOIN folders p ON f."parentId"=p.id CROSS JOIN args a
  WHERE f."userId"=a.owner AND NOT f.id=ANY(p.seen)
), records AS (
  SELECT k.id,'article'::text entity,k.title,''::text reference,
    concat_ws(' · ',f.path,k.type,(SELECT string_agg(t.name,' · ' ORDER BY t.id) FROM "KnowledgeArticleTag" l
      JOIN "KnowledgeTag" t ON t.id=l."tagId" AND t."userId"=a.owner WHERE l."articleId"=k.id AND l."userId"=a.owner)) structured,
    concat_ws(E'\n',k.summary,k.body) body,k."archivedAt" IS NOT NULL OR coalesce(f.archived,false) archived,
    k."updatedAt" "sortAt",NULL::integer "recurrenceId",NULL::text occurrence,jsonb_build_object('type',k.type,'folder',f.path) extra
  FROM "KnowledgeArticle" k CROSS JOIN args a LEFT JOIN folders f ON f.id=k."folderId"
  WHERE k."userId"=a.owner AND (k."folderId" IS NULL OR f.id IS NOT NULL)
)`;
