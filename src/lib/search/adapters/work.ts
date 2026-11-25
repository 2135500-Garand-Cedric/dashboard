export const tasksSQL = `, records AS (
  SELECT t.id,'task'::text entity,t.title,
    'TASK-'||lpad(t.id::text,greatest(4,length(t.id::text)),'0') reference,
    concat_ws(' · ',p.name,c.name,t.system,(SELECT string_agg(person.name,' · ' ORDER BY person.id)
      FROM "TodoAffectedContact" link JOIN "WorkContact" person ON person.id=link."contactId" AND person."userId"=a.owner WHERE link."todoId"=t.id)) structured,
    concat_ws(E'\n',t.description,t."desiredOutcome",t."nextAction",t."completionSummary",t."waitingOn",t."waitingReason",t.workaround,
      (SELECT string_agg(f.reason,E'\n' ORDER BY f.id) FROM "WorkFollowUp" f WHERE f."todoId"=t.id AND f.status='ACTIVE'),
      (SELECT string_agg(n.body,E'\n' ORDER BY n.id) FROM "WorkNote" n WHERE n."userId"=a.owner AND n."todoId"=t.id AND n."removedAt" IS NULL)) body,
    t."archivedAt" IS NOT NULL archived,t."updatedAt" "sortAt",t."recurrenceId",t."recurrenceDate" occurrence,
    jsonb_build_object('status',t.status,'project',p.name,'date',t."deadlineDate",'at',t."deadlineAt" AT TIME ZONE 'UTC','occurrence',t."recurrenceDate",'repeats',t."recurrenceId" IS NOT NULL,'color',act.color) extra
  FROM "Todo" t CROSS JOIN args a
  LEFT JOIN "WorkProject" p ON p.id=t."projectId" AND p."userId"=a.owner
  LEFT JOIN "WorkContact" c ON c.id=t."requesterId" AND c."userId"=a.owner
  LEFT JOIN "ActivityType" act ON act.id=t."activityTypeId"
  WHERE t."userId"=a.owner
)`;
export const projectsSQL = `, records AS (
  SELECT p.id,'project'::text entity,p.name title,
    'PROJECT-'||lpad(p.id::text,greatest(4,length(p.id::text)),'0') reference,
    concat_ws(' · ',
      (SELECT string_agg(s.name,' · ' ORDER BY s.id) FROM "WorkProjectStage" s WHERE s."projectId"=p.id AND s.active),
      (SELECT string_agg(k.label,' · ' ORDER BY k.id) FROM "WorkKeyDate" k WHERE k."projectId"=p.id AND k."removedAt" IS NULL)) structured,
    concat_ws(E'\n',p.objective,p.summary,p."completionSummary",
      (SELECT string_agg(n.body,E'\n' ORDER BY n.id) FROM "WorkNote" n WHERE n."userId"=a.owner AND n."projectId"=p.id AND n."todoId" IS NULL AND n."removedAt" IS NULL)) body,
    p."archivedAt" IS NOT NULL archived,p."updatedAt" "sortAt",NULL::integer "recurrenceId",NULL::text occurrence,
    jsonb_build_object('status',p.status,'date',p."targetDate",'color',act.color) extra
  FROM "WorkProject" p CROSS JOIN args a LEFT JOIN "ActivityType" act ON act.id=p."activityTypeId" WHERE p."userId"=a.owner
)`;
