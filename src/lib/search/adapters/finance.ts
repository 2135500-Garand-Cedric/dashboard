export const financeSQL = `, records AS (
  SELECT t.id,'activity'::text entity,t.description title,''::text reference,
    concat_ws(' · ',acc.name,CASE WHEN t.type='REFUND' THEN refund_categories.name ELSE cat.name END,t.counterparty,
      (SELECT string_agg(concat_ws(' · ',r.merchant,r.notes),' · ' ORDER BY r.id) FROM "FinancialReceipt" r
        WHERE r."userId"=a.owner AND (r."transactionId"=t.id OR EXISTS(SELECT 1 FROM "FinancialMatch" m
          WHERE m."userId"=a.owner AND m.status='CONFIRMED' AND m."transactionId"=t.id AND m."receiptId"=r.id)
          OR EXISTS(SELECT 1 FROM "FinancialMatch" m
            JOIN "FinancialTransaction" source ON source.id=m."sourceTransactionId" AND source."userId"=a.owner
            WHERE m."userId"=a.owner AND m.status='CONFIRMED' AND m.kind='DUPLICATE'
              AND m."transactionId"=t.id AND source.id=r."transactionId"))),
      (SELECT string_agg(concat_ws(' · ',i.description,s.name,i.notes),' · ' ORDER BY i.id) FROM "FinancialIncomeRecord" i
        LEFT JOIN "FinancialIncomeSource" s ON s.id=i."sourceId" AND s."userId"=a.owner
        WHERE i."userId"=a.owner AND (i."transactionId"=t.id OR EXISTS(SELECT 1 FROM "FinancialMatch" m
          WHERE m."userId"=a.owner AND m.status='CONFIRMED' AND m."transactionId"=t.id AND m."incomeRecordId"=i.id)
          OR EXISTS(SELECT 1 FROM "FinancialMatch" m
            JOIN "FinancialTransaction" source ON source.id=m."sourceTransactionId" AND source."userId"=a.owner
            WHERE m."userId"=a.owner AND m.status='CONFIRMED' AND m.kind='DUPLICATE'
              AND m."transactionId"=t.id AND source.id=i."transactionId"))),
      (SELECT string_agg(concat_ws(' · ',p.person,c.name),' · ' ORDER BY p.id) FROM "FinancialReimbursementPlan" p
        JOIN "WorkContact" c ON c.id=p."contactId" AND c."userId"=a.owner
        WHERE p."userId"=a.owner AND (p."expenseId"=t.id OR EXISTS(SELECT 1 FROM "FinancialReimbursement" r
          WHERE r."userId"=a.owner AND r."planId"=p.id AND r."paymentId"=t.id))),
      (SELECT string_agg(e."sourceIdentifier",' · ' ORDER BY e.id) FROM "FinancialImportEntry" e
        JOIN "FinancialImport" b ON b.id=e."importId" AND b."userId"=a.owner WHERE e."transactionId"=t.id
          OR EXISTS(SELECT 1 FROM "FinancialTransaction" peer
            WHERE peer.id=e."transactionId" AND peer."userId"=a.owner AND peer."transferId"=t."transferId")),
      (SELECT string_agg(pa.name,' · ' ORDER BY peer.id) FROM "FinancialTransaction" peer
        JOIN "FinancialAccount" pa ON pa.id=peer."accountId" AND pa."userId"=a.owner
        WHERE peer."transferId"=t."transferId" AND peer.id<>t.id AND peer."userId"=a.owner)) structured,
    coalesce(t.notes,'') body,false archived,t."occurredOn"::timestamp "sortAt",NULL::integer "recurrenceId",NULL::text occurrence,
    jsonb_build_object('type',t.type,'account',acc.name,'category',CASE WHEN t.type='REFUND' THEN refund_categories.name ELSE cat.name END,'date',t."occurredOn",
      'amount',(t.amount-sign(t.amount)*t."excludedAmount")::text,'currency',t.currency) extra
  FROM "FinancialTransaction" t CROSS JOIN args a
  JOIN "FinancialAccount" acc ON acc.id=t."accountId" AND acc."userId"=a.owner
  LEFT JOIN "FinanceCategory" cat ON cat.id=t."categoryId" AND cat."userId"=a.owner
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT c.name,' · ') name FROM "FinancialReimbursement" r
    JOIN "FinancialTransaction" expense ON expense.id=r."expenseId" AND expense."userId"=a.owner
    JOIN "FinanceCategory" c ON c.id=expense."categoryId" AND c."userId"=a.owner
    WHERE r."userId"=a.owner AND r."paymentId"=t.id
  ) refund_categories ON true
  WHERE t."userId"=a.owner AND abs(t.amount)>t."excludedAmount" AND (t."transferId" IS NULL OR t.amount<0)
    AND (t."transferId" IS NULL OR EXISTS(SELECT 1 FROM "FinancialTransfer" tr WHERE tr.id=t."transferId" AND tr."userId"=a.owner))
  UNION ALL
  SELECT b.id,'statement',coalesce(b."originalName",'Statement #'||b.id),'',acc.name,
    concat_ws(' ',b."periodStart"::text,b."periodEnd"::text),false,b."createdAt",NULL,NULL,
    jsonb_build_object('type',b.status,'account',acc.name,'date',b."periodStart",'through',b."periodEnd")
  FROM "FinancialImport" b CROSS JOIN args a JOIN "FinancialAccount" acc ON acc.id=b."accountId" AND acc."userId"=a.owner
  WHERE b."userId"=a.owner
)`;
