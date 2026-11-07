import { randomUUID, createHash } from "node:crypto";
import { mkdir, chmod, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const NOTE = "Synthetic development example. Not personal financial activity.";
const label = value => `[Example] ${value}`;
const money = value => { const [whole, part = ""] = String(value).split("."); return `${whole}.${part.padEnd(4, "0")}`; };
function samplePdf(lines) {
  const escaped = lines.map(line => String(line).replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, " "));
  const content = `BT /F1 15 Tf 35 740 Td ${escaped.map((line, i) => `${i ? "0 -28 Td " : ""}(${line}) Tj`).join("\n")} ET\n`;
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>', `<</Length ${Buffer.byteLength(content)}>>\nstream\n${content}endstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let text = "%PDF-1.4\n"; const offsets = [];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(text);
  return Buffer.from(`${text}xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`);
}
async function samplePng(lines) {
  // Tiny bitmap glyphs make labelled test documents readable in minimal containers,
  // without installing system fonts or generating indistinguishable blank images.
  const font = {
    A:"01110 10001 10001 11111 10001 10001 10001",B:"11110 10001 10001 11110 10001 10001 11110",C:"01111 10000 10000 10000 10000 10000 01111",D:"11110 10001 10001 10001 10001 10001 11110",E:"11111 10000 10000 11110 10000 10000 11111",F:"11111 10000 10000 11110 10000 10000 10000",G:"01111 10000 10000 10111 10001 10001 01111",H:"10001 10001 10001 11111 10001 10001 10001",I:"11111 00100 00100 00100 00100 00100 11111",J:"00111 00010 00010 00010 10010 10010 01100",K:"10001 10010 10100 11000 10100 10010 10001",L:"10000 10000 10000 10000 10000 10000 11111",M:"10001 11011 10101 10101 10001 10001 10001",N:"10001 11001 10101 10011 10001 10001 10001",O:"01110 10001 10001 10001 10001 10001 01110",P:"11110 10001 10001 11110 10000 10000 10000",Q:"01110 10001 10001 10001 10101 10010 01101",R:"11110 10001 10001 11110 10100 10010 10001",S:"01111 10000 10000 01110 00001 00001 11110",T:"11111 00100 00100 00100 00100 00100 00100",U:"10001 10001 10001 10001 10001 10001 01110",V:"10001 10001 10001 10001 10001 01010 00100",W:"10001 10001 10001 10101 10101 11011 10001",X:"10001 10001 01010 00100 01010 10001 10001",Y:"10001 10001 01010 00100 00100 00100 00100",Z:"11111 00001 00010 00100 01000 10000 11111",
    0:"01110 10001 10011 10101 11001 10001 01110",1:"00100 01100 00100 00100 00100 00100 01110",2:"01110 10001 00001 00010 00100 01000 11111",3:"11110 00001 00001 01110 00001 00001 11110",4:"00010 00110 01010 10010 11111 00010 00010",5:"11111 10000 10000 11110 00001 00001 11110",6:"01110 10000 10000 11110 10001 10001 01110",7:"11111 00001 00010 00100 01000 01000 01000",8:"01110 10001 10001 01110 10001 10001 01110",9:"01110 10001 10001 01111 00001 00001 01110",".":"00000 00000 00000 00000 00000 00100 00100","-":"00000 00000 00000 11111 00000 00000 00000","/":"00001 00001 00010 00100 01000 10000 10000"
  };
  const pixels = [];
  lines.forEach((line, i) => [...String(line).toUpperCase()].forEach((character, j) => (font[character]?.split(" ") ?? []).forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "1") pixels.push(`<rect x="${35 + j * 18 + x * 3}" y="${45 + i * 45 + y * 3}" width="3" height="3"/>`); }))));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="880"><rect width="680" height="880" fill="white"/><g fill="#132238">${pixels.join("")}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
export async function seedFinanceExamples(prisma, { today, root, userId = 1 }) {
  const written = [];
  const storage = path.resolve(root), publicRoot = path.resolve("public");
  if (storage === publicRoot || storage.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Example documents must use private storage.");
  try {
    return await prisma.$transaction(async db => {
      const existing = await db.financialExampleDataset.findUnique({ where: { userId } });
      if (existing) return { reused: true, manifest: existing.manifest };
      if (!await db.user.findUnique({ where: { id: userId } })) throw new Error("Initialize the development owner before adding finance examples.");
      if (await db.financialAccount.count({ where: { userId, name: { startsWith: "[Example]" } } })) throw new Error("Example-named accounts already exist without a dataset manifest. No records were changed.");
      const manifest = { asOf: today, accountIds: [], categoryIds: [], sourceIds: [], deductionTypeIds: [], transactionIds: [], receiptIds: [], incomeIds: [], importIds: [], documentIds: [], storageKeys: [] };
      const tracked = async (model, key, data) => { const row = await db[model].create({ data: { userId, ...data } }); manifest[key].push(row.id); return row; };
      const account = async (name, type, currency = "CAD", active = true) => tracked("financialAccount", "accountIds", { name: label(name), normalizedName: label(name).toLowerCase(), type, currency, active, maskedIdentifier: type === "CREDIT_CARD" ? "**** 4242" : null });
      const bank = await account("Chequing", "CHEQUING"), savings = await account("Savings", "SAVINGS"), card = await account("Visa", "CREDIT_CARD"), cash = await account("Cash", "CASH"), other = await account("Travel wallet", "OTHER"), usd = await account("USD savings", "SAVINGS", "USD"), archive = await account("Old cash wallet", "CASH", "CAD", false);
      const categories = {};
      for (const [name, type] of [["Salary", "INCOME"], ["Freelance", "INCOME"], ["Interest", "INCOME"], ["Gifts", "INCOME"], ["Reimbursements", "INCOME"], ["Other income", "INCOME"], ["Rent", "EXPENSE"], ["Groceries", "EXPENSE"], ["Dining", "EXPENSE"], ["Transport", "EXPENSE"], ["Utilities", "EXPENSE"], ["Health", "EXPENSE"], ["Shopping", "EXPENSE"], ["Miscellaneous", "EXPENSE"], ["Old travel", "EXPENSE"]]) categories[name] = await tracked("financeCategory", "categoryIds", { name: label(name), normalizedName: label(name).toLowerCase(), type });
      const sources = {};
      for (const [name, kind] of [["Maple Studio", "EMPLOYMENT"], ["Freelance design", "FREELANCE"], ["Savings interest", "INTEREST"], ["Family gift", "GIFT"], ["Work reimbursement", "REIMBURSEMENT"], ["One-time award", "OTHER"]]) sources[kind] = await tracked("financialIncomeSource", "sourceIds", { name: label(name), normalizedName: label(name).toLowerCase(), kind });
      const deductions = [];
      for (const name of ["Income tax", "QPP/CPP", "EI", "QPIP", "Other deductions"]) deductions.push(await tracked("financialDeductionType", "deductionTypeIds", { name: label(name), normalizedName: label(name).toLowerCase() }));
      function date(offset, requestedDay) { const month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); month.setUTCMonth(month.getUTCMonth() + offset); const actualDay = offset === 0 ? Math.min(Number(today.slice(8)), requestedDay) : requestedDay; return new Date(`${month.toISOString().slice(0, 7)}-${String(actualDay).padStart(2, "0")}T00:00:00Z`); }
      const txn = async (description, amount, type, account, category = null, when = date(0, 4), counterparty = null, source = "MANUAL", extra = {}) => tracked("financialTransaction", "transactionIds", { accountId: account.id, categoryId: category?.id ?? null, occurredOn: when, amount: money(amount), currency: account.currency, type, source, description: label(description), counterparty, notes: NOTE, requestKey: randomUUID(), ...extra });
      const transfer = async (description, amount, from, to, when, destinationAmount = amount) => {
        const group = await db.financialTransfer.create({ data: { userId } });
        return [await txn(description, `-${amount}`, "TRANSFER", from, null, when, null, "MANUAL", { transferId: group.id }), await txn(description, destinationAmount, "TRANSFER", to, null, when, null, "MANUAL", { transferId: group.id })];
      };
      const document = async (type, idKey, id, name, buffer, extension, mimeType, accountId = null) => {
        await mkdir(storage, { recursive: true, mode: 0o700 }); await chmod(storage, 0o700);
        const storageKey = `${randomUUID()}.${extension}`; await writeFile(path.join(storage, storageKey), buffer, { flag: "wx", mode: 0o600 }); written.push(storageKey);
        const doc = await tracked("financialDocument", "documentIds", { [idKey]: id, accountId, type, storageKey, originalName: label(name), mimeType, byteSize: buffer.length, contentHash: extension === "csv" ? null : createHash("sha256").update(buffer).digest("hex") }); manifest.storageKeys.push(storageKey); return doc;
      };
      const link = async (kind, source, target, amount, status = "CONFIRMED", note = "Example matching decision") => {
        const idField = kind === "RECEIPT" ? "receiptId" : kind === "INCOME" ? "incomeRecordId" : kind === "STATEMENT" ? "importEntryId" : "sourceTransactionId";
        const sourceDate = source.purchasedOn ?? source.paidOn ?? source.occurredOn ?? target.occurredOn;
        const snapshot = { origin: "example", id: source.id, label: source.merchant ?? source.description ?? "Example statement row", date: sourceDate.toISOString().slice(0, 10), accountId: source.accountId ?? target.accountId, signedAmount: target.amount.toFixed(4), amount: money(amount), currency: target.currency, type: target.type };
        const pairKey = `${kind}:${source.id}:${target.id}`;
        const previous = await db.financialMatch.findUnique({ where: { userId_pairKey: { userId, pairKey } } });
        const match = await db.financialMatch.upsert({ where: { userId_pairKey: { userId, pairKey } }, create: { userId, kind, pairKey, [idField]: source.id, transactionId: target.id, amount: money(amount), currency: target.currency, status, sourceSnapshot: snapshot, note }, update: { amount: money(amount), status, revision: { increment: 1 }, note } });
        await db.financialMatchEvent.create({ data: { userId, matchId: match.id, requestKey: randomUUID(), requestFingerprint: createHash("sha256").update(pairKey + status + match.revision).digest("hex"), action: status === "CONFIRMED" ? previous ? "CORRECT" : "CONFIRM" : status === "REJECTED" ? "REJECT" : "UNLINK", details: { kind, sourceId: source.id, transactionId: target.id, amount: money(amount), currency: target.currency, status, note, source: snapshot } } });
        if (kind === "DUPLICATE") { const active = await db.financialMatch.findMany({ where: { userId, kind, sourceTransactionId: source.id, status: "CONFIRMED" } }); const excludedAmount = active.reduce((sum, row) => sum.plus(row.amount), source.amount.abs().mul(0)); await db.financialTransaction.update({ where: { id: source.id }, data: { excludedAmount } }); }
        return match;
      };
      const receipt = async (merchant, amount, account, category, when, target = null) => {
        const record = await tracked("financialReceipt", "receiptIds", { merchant: label(merchant), purchasedOn: when, accountId: account.id, categoryId: category.id, subtotal: money(amount), tax: "0", tip: "0", total: money(amount), currency: account.currency, notes: NOTE, requestKey: randomUUID(), transactionId: target?.id ?? null });
        if (target) await link("RECEIPT", record, target, amount); return record;
      };
      const pay = async (name, amount, source, category, account, when, target = null, employment = false) => {
        const record = await tracked("financialIncomeRecord", "incomeIds", { description: label(name), sourceId: source.id, accountId: account?.id ?? null, categoryId: category.id, paidOn: when, periodStart: employment ? new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() - 1, 1)) : null, periodEnd: employment ? new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 0)) : null, grossAmount: employment ? "2000" : null, netAmount: money(amount), currency: account?.currency ?? "CAD", notes: NOTE, transactionId: target?.id ?? null, requestKey: randomUUID() });
        if (employment) for (const [i, deduction] of deductions.entries()) await db.financialIncomeDeduction.create({ data: { incomeRecordId: record.id, typeId: deduction.id, amount: ["300", "120", "50", "10", "20"][i] } });
        if (target) await link("INCOME", record, target, amount); return record;
      };
      const recent = {};
      for (let offset = -23; offset <= 0; offset++) {
        const salary = await txn("Payroll deposit", "1500", "INCOME", bank, categories.Salary, date(offset, 1), "Maple Studio", offset % 2 ? "IMPORTED" : "MANUAL");
        const payroll = await pay("Monthly pay", "1500", sources.EMPLOYMENT, categories.Salary, bank, date(offset, 1), salary, true);
        const groceryAmount = String(190 + (offset + 24) % 5 * 12);
        const groceries = await txn("Grocery purchase", `-${groceryAmount}`, "EXPENSE", bank, categories.Groceries, date(offset, 5), "Neighbourhood Market", "IMPORTED");
        const groceryReceipt = await receipt("Neighbourhood Market", groceryAmount, bank, categories.Groceries, date(offset, 5), groceries);
        await txn("Apartment rent", "-700", "EXPENSE", bank, categories.Rent, date(offset, 2), "Example Housing");
        await txn("Electricity bill", `-${70 + (offset + 24) % 4 * 9}`, "EXPENSE", bank, categories.Utilities, date(offset, 8), "Example Energy", "IMPORTED");
        const dining = await txn("Dinner with friends", "-46", "EXPENSE", card, categories.Dining, date(offset, 12), "Maple Bistro");
        const diningReceipt = await receipt("Maple Bistro", "46", card, categories.Dining, date(offset, 12), dining);
        await txn("Coffee paid in cash", "-8.50", "EXPENSE", cash, categories.Dining, date(offset, 16), "Corner Cafe");
        await txn("Bus tickets", "-32.50", "EXPENSE", other, categories.Transport, date(offset, 18), "City Transit");
        const interest = await txn("Savings interest", "4.1250", "INCOME", savings, categories.Interest, date(offset, 25), "Savings interest", "IMPORTED");
        await pay("Savings interest", "4.1250", sources.INTEREST, categories.Interest, savings, date(offset, 25), interest);
        await transfer("Credit card bill payment", "150", bank, card, date(offset, 20));
        await transfer("Savings transfer", "100", bank, savings, date(offset, 21));
        await txn("Statement rounding adjustment", offset % 2 ? "0.01" : "-0.02", "ADJUSTMENT", bank, null, date(offset, 26));
        if (offset % 3 === 0) {
          const reimbursement = await txn("Work expense reimbursement", "35", "INCOME", bank, categories.Reimbursements, date(offset, 15), "Maple Studio");
          await pay("Work reimbursement", "35", sources.REIMBURSEMENT, categories.Reimbursements, bank, date(offset, 15), reimbursement);
          const purchase = await txn("Jacket purchase", "-120", "EXPENSE", card, categories.Shopping, date(offset, 10), "North Outfitters");
          const refund = await txn("Jacket partial refund", "30", "REFUND", card, categories.Shopping, date(offset, 23), "North Outfitters", "IMPORTED");
          await link("REFUND", refund, purchase, "30");
        }
        if (offset >= -2) {
          await document("PAY_STUB", "incomeRecordId", payroll.id, `pay-stub-${date(offset, 1).toISOString().slice(0, 7)}.pdf`, samplePdf(["EXAMPLE PAY STUB - NOT REAL", `Record ${payroll.id}`, "Maple Studio", date(offset, 1).toISOString().slice(0, 10), "Gross CAD 2,000.00", "Deductions CAD 500.00", "Net CAD 1,500.00", "Income tax 300 / QPP 120 / EI 50", "QPIP 10 / Other 20"]), "pdf", "application/pdf", bank.id);
          await document("RECEIPT", "receiptId", groceryReceipt.id, `grocery-${offset}.png`, await samplePng(["EXAMPLE RECEIPT - NOT REAL", "Neighbourhood Market", `Receipt ${groceryReceipt.id}`, date(offset, 5).toISOString().slice(0, 10), `Subtotal CAD ${groceryAmount}.00`, "Tax CAD 0.00", "Tip CAD 0.00", `Total CAD ${groceryAmount}.00`]), "png", "image/png", bank.id);
          await document("RECEIPT", "receiptId", diningReceipt.id, `dining-${offset}.pdf`, samplePdf(["EXAMPLE RECEIPT - NOT REAL", `Receipt ${diningReceipt.id}`, "Maple Bistro", date(offset, 12).toISOString().slice(0, 10), "Subtotal 40.00 / Tax 4.00 / Tip 2.00", "Total CAD 46.00"]), "pdf", "application/pdf", card.id);
          await db.financialReceipt.update({ where: { id: diningReceipt.id }, data: { subtotal: "40", tax: "4", tip: "2" } });
        }
        if (offset === 0) Object.assign(recent, { salary, payroll, groceries, dining });
      }
      for (const [kind, category, amount] of [["FREELANCE", "Freelance", "275"], ["GIFT", "Gifts", "100"], ["OTHER", "Other income", "50"]]) {
        const deposit = await txn(`${kind.toLowerCase()} payment`, amount, "INCOME", bank, categories[category], date(0, 3), sources[kind].name);
        await pay(`${kind.toLowerCase()} income`, amount, sources[kind], categories[category], bank, date(0, 3), deposit);
      }
      await txn("USD interest", "12.50", "INCOME", usd, categories.Interest, date(0, 2), "USD savings interest");
      await transfer("CAD to USD savings", "100", bank, usd, date(0, 3), "72.50");
      await txn("Archived travel purchase", "-18", "EXPENSE", archive, categories["Old travel"], date(-13, 5), "Old Travel Cafe");
      await db.financeCategory.update({ where: { id: categories["Old travel"].id }, data: { active: false } });
      await receipt("Unmatched stationery receipt", "19.99", bank, categories.Miscellaneous, date(0, 4));
      await pay("Gift details without deposit", "120", sources.GIFT, categories.Gifts, null, date(0, 4));
      const split = await receipt("Split-payment purchase", "100", bank, categories.Shopping, date(0, 4));
      const debit = await txn("Split purchase debit", "-60", "EXPENSE", bank, categories.Shopping, date(0, 4), "Example Electronics"), cashLeg = await txn("Split purchase cash", "-40", "EXPENSE", cash, categories.Shopping, date(0, 4), "Example Electronics");
      await link("RECEIPT", split, debit, "60"); await link("RECEIPT", split, cashLeg, "40");
      const combined = await txn("Combined two receipts", "-70", "EXPENSE", card, categories.Health, date(0, 5), "Neighbourhood Pharmacy");
      const r1 = await receipt("Pharmacy prescription", "40", card, categories.Health, date(0, 5)), r2 = await receipt("Pharmacy supplies", "30", card, categories.Health, date(0, 5));
      await link("RECEIPT", r1, combined, "40"); await link("RECEIPT", r2, combined, "30");
      const splitPay = await pay("Split freelance deposit", "300", sources.FREELANCE, categories.Freelance, bank, date(0, 5));
      const p1 = await txn("Freelance bank deposit", "200", "INCOME", bank, categories.Freelance, date(0, 5), "Example Client"), p2 = await txn("Freelance savings deposit", "100", "INCOME", savings, categories.Freelance, date(0, 5), "Example Client");
      await link("INCOME", splitPay, p1, "200"); await link("INCOME", splitPay, p2, "100");
      const manual = await txn("Manual lunch already on statement", "-25", "EXPENSE", bank, categories.Dining, date(0, 4), "Corner Deli"), actual = await txn("Deli statement posting", "-25", "EXPENSE", bank, categories.Dining, date(0, 5), "Corner Deli", "IMPORTED");
      await receipt("Corner Deli", "25", bank, categories.Dining, date(0, 4), manual); await link("DUPLICATE", manual, actual, "25");
      const groupedManual = await txn("One manual purchase, two postings", "-100", "EXPENSE", bank, categories.Shopping, date(0, 4), "Example Home Shop");
      const g1 = await txn("Home shop posting A", "-40", "EXPENSE", bank, categories.Shopping, date(0, 4), "Example Home Shop", "IMPORTED"), g2 = await txn("Home shop posting B", "-60", "EXPENSE", bank, categories.Shopping, date(0, 5), "Example Home Shop", "IMPORTED");
      await link("DUPLICATE", groupedManual, g1, "40"); await link("DUPLICATE", groupedManual, g2, "60");
      const possible = await txn("Manual purchase to review", "-80", "EXPENSE", bank, categories.Shopping, date(0, 4), "Example Books"), possibility = await txn("Bookshop statement posting", "-80", "EXPENSE", bank, categories.Shopping, date(0, 5), "Example Books", "IMPORTED");
      const rejected = await txn("Different identical purchase", "-80", "EXPENSE", bank, categories.Shopping, date(0, 3), "Other Example Shop", "IMPORTED"); await link("DUPLICATE", possible, rejected, "80", "REJECTED", "Different real purchase with the same amount");
      const unlinked = await txn("Statement match needing review", "-31", "EXPENSE", bank, categories.Miscellaneous, date(0, 5), "Example Office");
      const headers = ["Date", "Description", "Amount", "Type", "Reference"], parsing = { delimiter: "AUTO", encoding: "AUTO", headerRow: 1, detectedDelimiter: ",", detectedEncoding: "utf-8" };
      const mapping = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2, debitColumn: null, creditColumn: null, currencyColumn: null, typeColumn: 3, referenceColumn: 4, counterpartyColumn: null, notesColumn: null, categoryColumn: null, amountMode: "SIGNED", signConvention: "INFLOW_POSITIVE", debitDirection: "OUTFLOW", dateFormat: "YYYY-MM-DD", decimal: ".", outflowType: "REVIEW", inflowType: "REVIEW", expenseCategoryId: categories.Groceries.id, incomeCategoryId: categories.Salary.id, typeRules: ["EXPENSE", "INCOME", "REFUND", "TRANSFER", "ADJUSTMENT"].map(type => ({ value: type, type })), confirmed: true };
      const review = row => ({ date: row.occurredOn.toISOString().slice(0, 10), description: row.description, amount: row.amount.toFixed(4), currency: row.currency, type: row.type, categoryId: row.categoryId, counterparty: row.counterparty ?? "", notes: NOTE, reference: `example-${row.id}`, otherAccountId: null, otherAmount: "", matchId: row.id, allowDuplicate: false });
      const quote = value => `"${String(value).replace(/"/g, '""')}"`;
      const csv = rows => Buffer.from([headers, ...rows].map(row => row.map(quote).join(",")).join("\r\n") + "\r\n");
      const bankRows = [recent.salary, actual, possibility, unlinked], csvRows = bankRows.map(row => [row.occurredOn.toISOString().slice(0, 10), row.description, row.amount.toFixed(4), row.type, `example-${row.id}`]), bankCsv = csv(csvRows);
      const batch = await tracked("financialImport", "importIds", { accountId: bank.id, fingerprint: createHash("sha256").update(bankCsv).digest("hex"), status: "COMPLETED", revision: 3, originalName: label("bank-statement.csv"), byteSize: bankCsv.length, headers, parsing, mapping, completedAt: new Date() });
      for (const [i, row] of bankRows.entries()) {
        const action = i === 0 || i === 3 ? "MATCH" : "CREATE", entry = await db.financialImportEntry.create({ data: { importId: batch.id, rowKey: String(i + 1), rowNumber: i + 1, action, originalData: { cells: csvRows[i], line: i + 2 }, normalized: review(row), sourceIdentifier: `example-${row.id}`, rowFingerprint: createHash("sha256").update(JSON.stringify(csvRows[i])).digest("hex"), transactionId: row.id } });
        if (action === "MATCH") await link("STATEMENT", entry, row, row.amount.abs().toFixed(4));
        if (i === 3) { await link("STATEMENT", entry, row, "31", "UNLINKED", "Example unlink retained the original record"); await db.financialImportEntry.update({ where: { id: entry.id }, data: { transactionId: null } }); }
      }
      await document("BANK_STATEMENT", "importId", batch.id, "bank-statement.csv", bankCsv, "csv", "text/csv", bank.id);
      const draftRows = [[date(0, 5).toISOString().slice(0, 10), label("Draft card purchase"), "18.25", "EXPENSE", "draft-1"], ["invalid-date", label("Correct the date before importing"), "7.10", "EXPENSE", "draft-2"], [date(0, 5).toISOString().slice(0, 10), "Balance footer - skip", "0", "", ""]], draftCsv = csv(draftRows);
      const draft = await tracked("financialImport", "importIds", { accountId: card.id, fingerprint: createHash("sha256").update(draftCsv).digest("hex"), status: "DRAFT", revision: 2, originalName: label("card-statement-draft.csv"), byteSize: draftCsv.length, headers, parsing, mapping: { ...mapping, signConvention: "OUTFLOW_POSITIVE" } });
      for (const [i, cells] of draftRows.entries()) await db.financialImportEntry.create({ data: { importId: draft.id, rowKey: String(i + 1), rowNumber: i + 1, action: i === 2 ? "SKIP" : "REVIEW", originalData: { cells, line: i + 2 }, sourceIdentifier: cells[4] || null, normalized: { date: cells[0], description: cells[1], amount: i === 2 ? "0.0000" : `-${money(cells[2])}`, currency: "CAD", type: i === 2 ? null : "EXPENSE", categoryId: i === 2 ? null : categories.Groceries.id, counterparty: "", notes: NOTE, reference: cells[4], otherAccountId: null, otherAmount: "", matchId: null, allowDuplicate: false } } });
      await document("CREDIT_CARD_STATEMENT", "importId", draft.id, "card-statement-draft.csv", draftCsv, "csv", "text/csv", card.id);
      await db.financialExampleDataset.create({ data: { userId, version: 1, manifest } });
      return { reused: false, manifest };
    }, { isolationLevel: "Serializable", timeout: 120000 });
  } catch (error) { await Promise.all(written.map(key => unlink(path.join(storage, key)).catch(() => {}))); throw error; }
}
