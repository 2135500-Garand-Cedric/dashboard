export const peopleSQL = `, records AS (
  SELECT p.id,'person'::text entity,p.name title,''::text reference,concat_ws(' · ',p.company,p.email,p.phone) structured,
    coalesce(p.notes,'') body,NOT p.active archived,p."updatedAt" "sortAt",NULL::integer "recurrenceId",NULL::text occurrence,
    jsonb_build_object('company',p.company,'email',p.email) extra
  FROM "WorkContact" p CROSS JOIN args a WHERE p."userId"=a.owner
)`;
export const vocabularySQL = `, records AS (
  SELECT v.id,'vocabulary'::text entity,v.english title,''::text reference,
    concat_ws(' · ',v.japanese,v.hiragana,array_to_string(v.readings,' / '),c.name) structured,''::text body,false archived,
    v."addedDate" "sortAt",NULL::integer "recurrenceId",NULL::text occurrence,
    jsonb_build_object('japanese',v.japanese,'reading',concat_ws(' / ',v.hiragana,array_to_string(v.readings,' / ')),'category',c.name) extra
  FROM "Vocabulary" v CROSS JOIN args a LEFT JOIN "Category" c ON c.id=v."categoryId" WHERE v."userId"=a.owner
)`;
