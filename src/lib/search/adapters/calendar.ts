export const calendarSQL = `, records AS (
  SELECT e.id,'event'::text entity,e.title,''::text reference,
    concat_ws(' · ',t.title,p.name,e.type,(SELECT string_agg(concat_ws(' · ',linked.title,project.name),' · ' ORDER BY linked.id)
      FROM "EventTaskLink" link JOIN "Todo" linked ON linked.id=link."todoId" AND linked."userId"=a.owner
      LEFT JOIN "WorkProject" project ON project.id=linked."projectId" AND project."userId"=a.owner WHERE link."eventId"=e.id)) structured,coalesce(e.description,'') body,false archived,
    e."updatedAt" "sortAt",e."recurrenceId",e."recurrenceDate" occurrence,
    jsonb_build_object('type',e.kind,'date',e."allDayStart",'through',e."allDayEnd",'at',e.date AT TIME ZONE 'UTC','endAt',e."endDate" AT TIME ZONE 'UTC','repeats',e."recurrenceId" IS NOT NULL,'completed',e.completed) extra
  FROM "Event" e CROSS JOIN args a
  LEFT JOIN "Todo" t ON t.id=e."linkedTodoId" AND t."userId"=a.owner
  LEFT JOIN "WorkProject" p ON p.id=t."projectId" AND p."userId"=a.owner
  WHERE e."userId"=a.owner
  UNION ALL
  SELECT h.id,'holiday',h.name,'',concat_ws(' · ',h.type,h.options->>'name'),'',false,h."createdAt",NULL,NULL,
    jsonb_build_object('type',h.type,'country',h.country,'state',h.state,'region',h.region,'rule',h.rule,'options',h.options)
  FROM "CalendarHoliday" h CROSS JOIN args a WHERE h."userId"=a.owner
  UNION ALL
  SELECT b.id,'birthday',b.name||'’s birthday','','Birthday','',false,b."updatedAt",NULL,NULL,
    jsonb_build_object('month',b.month,'day',b.day)
  FROM "CalendarBirthday" b CROSS JOIN args a WHERE b."userId"=a.owner
)`;
