import { FinanceValidationError } from "./validation";
import { calendarDate, decimalAmount } from "./transactions";

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 1000;
export const DATE_FORMATS = { "YYYY-MM-DD": "YYYY-MM-DD", "YYYY/MM/DD": "YYYY/MM/DD", "MM/DD/YYYY": "MM/DD/YYYY", "DD/MM/YYYY": "DD/MM/YYYY", "MM-DD-YYYY": "MM-DD-YYYY", "DD-MM-YYYY": "DD-MM-YYYY", "YYYYMMDD": "YYYYMMDD", "MM/DD/YY": "MM/DD/YY (20xx)", "DD/MM/YY": "DD/MM/YY (20xx)", "D MMM YYYY": "D MMM YYYY (English / French)", "MMM D, YYYY": "MMM D, YYYY (English / French)", ISO: "ISO date and time (printed date)" } as const;
export type DateFormat = keyof typeof DATE_FORMATS;
export interface CsvParsing { delimiter: "AUTO" | "," | ";" | "\t" | "|"; encoding: "AUTO" | "UTF-8" | "WINDOWS-1252"; headerRow: number; }
export interface CsvRecord { cells: string[]; line: number; }
export interface ParsedStatement { headers: string[]; rows: CsvRecord[]; parsing: CsvParsing & { detectedDelimiter: string; detectedEncoding: string }; }

export function decodeCsv(bytes: Uint8Array, encoding: CsvParsing["encoding"]) {
  let selected = encoding === "WINDOWS-1252" ? "windows-1252" : "utf-8";
  if (encoding === "AUTO" && bytes[0] === 0xff && bytes[1] === 0xfe) selected = "utf-16le";
  if (encoding === "AUTO" && bytes[0] === 0xfe && bytes[1] === 0xff) selected = "utf-16be";
  let text: string;
  try { text = new TextDecoder(selected, { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { throw new FinanceValidationError("Could not decode the CSV. Choose UTF-8, automatic BOM detection, or Windows-1252 as appropriate."); }
  if (text.includes("\0") || /^[\s]*(?:%PDF-|PK\x03\x04|<html|<!doctype)/i.test(text)) throw new FinanceValidationError("Upload a text CSV, not a PDF, spreadsheet workbook or HTML file.");
  return { text, encoding: selected };
}
// Bounded RFC-style CSV scanner: quoted separators, escaped quotes and embedded newlines.
export function scanCsv(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [], field = "", quoted = false, closed = false, line = 1, startLine = 1;
  const addField = () => { cells.push(field); field = ""; closed = false; if (cells.length > 100) throw new FinanceValidationError("CSV files may contain at most 100 columns."); };
  const addRecord = () => { addField(); if (cells.some(cell => cell.trim() !== "")) records.push({ cells, line: startLine }); cells = []; if (records.length > MAX_CSV_ROWS + 21) throw new FinanceValidationError(`Import at most ${MAX_CSV_ROWS} transaction rows at a time.`); };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { field += '"'; index++; } else { quoted = false; closed = true; } }
      else if (char === "\r" || char === "\n") { if (char === "\r" && text[index + 1] === "\n") index++; field += "\n"; line++; }
      else field += char;
    } else if (char === delimiter) addField();
    else if (char === "\r" || char === "\n") { addRecord(); if (char === "\r" && text[index + 1] === "\n") index++; line++; startLine = line; }
    else if (char === '"' && !field && !closed) quoted = true;
    else if (closed) { if (char !== " " && char !== "\t") throw new FinanceValidationError(`Unexpected characters after a closing quote near line ${line}.`); }
    else if (char === '"') throw new FinanceValidationError(`Unexpected quote near line ${line}. Quote the entire cell or escape embedded quotes.`);
    else field += char;
    if (field.length > 10000) throw new FinanceValidationError(`A CSV cell near line ${line} exceeds 10,000 characters.`);
  }
  if (quoted) throw new FinanceValidationError(`Unclosed quoted cell beginning near line ${startLine}.`);
  if (field || cells.length || closed) addRecord();
  return records;
}
export function parseStatement(bytes: Uint8Array, options: CsvParsing): ParsedStatement {
  if (!bytes.length || bytes.length > MAX_CSV_BYTES) throw new FinanceValidationError("Choose a non-empty CSV up to 2 MB.", 413);
  const decoded = decodeCsv(bytes, options.encoding);
  let text = decoded.text, delimiter: string = options.delimiter;
  const directive = text.match(/^sep=([,;\t|])\r?\n/i);
  if (directive) { text = text.slice(directive[0].length); if (delimiter === "AUTO") delimiter = directive[1]; }
  if (delimiter === "AUTO") {
    const candidates = [",", ";", "\t", "|"].map(value => {
      try { const records = scanCsv(text, value); const headerIndex = records.findIndex(row => row.line === options.headerRow); const header = records[headerIndex]; const width = header?.cells.length ?? 0; return { delimiter: value, score: width > 1 ? records.slice(headerIndex + 1, headerIndex + 11).filter(row => row.cells.length === width).length * 100 + width : 0 }; }
      catch { return { delimiter: value, score: -1 }; }
    }).sort((a, b) => b.score - a.score);
    if (candidates[0].score <= 0) throw new FinanceValidationError("Could not detect CSV columns. Choose a separator and the correct header row.");
    delimiter = candidates[0].delimiter;
  }
  const records = scanCsv(text, delimiter), headerIndex = records.findIndex(row => row.line === options.headerRow), header = records[headerIndex];
  if (!header || header.cells.length < 2) throw new FinanceValidationError("Choose a header row with at least two columns.");
  const rows = records.slice(headerIndex + 1);
  if (!rows.length || rows.length > MAX_CSV_ROWS) throw new FinanceValidationError(`A statement must contain 1 to ${MAX_CSV_ROWS} transaction rows.`);
  // Header selection excludes an optional Excel separator directive; audit line numbers do not.
  return { headers: header.cells.map(cell => cell.trim()), rows: directive ? rows.map(row => ({ ...row, line: row.line + 1 })) : rows, parsing: { ...options, detectedDelimiter: delimiter, detectedEncoding: decoded.encoding } };
}
const months: Record<string, number> = { jan: 1, january: 1, janvier: 1, feb: 2, february: 2, fev: 2, fevr: 2, fevrier: 2, mar: 3, march: 3, mars: 3, apr: 4, april: 4, avr: 4, avril: 4, may: 5, mai: 5, jun: 6, june: 6, juin: 6, jul: 7, july: 7, juil: 7, juillet: 7, aug: 8, august: 8, aou: 8, aout: 8, sep: 9, sept: 9, september: 9, septembre: 9, oct: 10, october: 10, octobre: 10, nov: 11, november: 11, novembre: 11, dec: 12, december: 12, decembre: 12 };
export function statementDate(value: string, format: DateFormat) {
  const text = value.trim(); let year: string, month: string, day: string;
  if (format === "ISO") {
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(text) || !Number.isFinite(Date.parse(text))) throw new FinanceValidationError("Expected an ISO date and time.");
    return calendarDate(text.slice(0, 10));
  }
  if (format === "YYYYMMDD") {
    const match = text.match(/^(\d{4})(\d{2})(\d{2})$/); if (!match) throw new FinanceValidationError("Expected YYYYMMDD.");
    [, year, month, day] = match;
  } else if (format === "D MMM YYYY" || format === "MMM D, YYYY") {
    const match = format === "D MMM YYYY" ? text.match(/^(\d{1,2})[ -]+([\p{L}.]+)[ -]+(\d{4})$/u) : text.match(/^([\p{L}.]+)\s+(\d{1,2}),?\s+(\d{4})$/u);
    if (!match) throw new FinanceValidationError("Expected a day, month name and four-digit year.");
    const name = (format === "D MMM YYYY" ? match[2] : match[1]).normalize("NFD").replace(/[\u0300-\u036f.]/g, "").toLowerCase();
    if (!months[name]) throw new FinanceValidationError("Unrecognized English/French month name.");
    year = match[3]; month = String(months[name]); day = format === "D MMM YYYY" ? match[1] : match[2];
  } else {
    const separator = format.includes("/") ? "/" : "-", parts = text.split(separator), pattern = format.split(separator);
    if (parts.length !== 3 || parts.some(part => !/^\d+$/.test(part))) throw new FinanceValidationError(`Expected ${format}.`);
    year = parts[pattern.findIndex(part => part === "YYYY" || part === "YY")]; month = parts[pattern.indexOf("MM")]; day = parts[pattern.indexOf("DD")];
    if (pattern.includes("YY")) { if (year.length !== 2) throw new FinanceValidationError("Expected a two-digit year (20xx)."); year = `20${year}`; }
    else if (year.length !== 4) throw new FinanceValidationError("Expected a four-digit year.");
    if (month.length > 2 || day.length > 2) throw new FinanceValidationError(`Expected ${format}.`);
  }
  return calendarDate(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
}
// Formatting is explicit; grouping must be valid and no floating-point money math is used.
export function statementAmount(value: string, decimal: "." | ",", currency: string) {
  let text = value.trim().replace(/\u2212/g, "-").replace(/[\u00a0\u202f]/g, " ");
  const alias = text.match(/(?:CA|US|C)\$/i)?.[0];
  if (alias) { const aliasCurrency = /^US/i.test(alias) ? "USD" : "CAD"; if (aliasCurrency !== currency) throw new FinanceValidationError("Amount currency label differs from the selected currency."); text = text.replace(alias, "$" ); }
  const codes = text.match(/[A-Za-z]{3}/g) ?? [];
  if (codes.some(code => code.toUpperCase() !== currency)) throw new FinanceValidationError("Amount currency label differs from the selected currency.");
  for (const [symbol, currencies] of [["€", ["EUR"]], ["£", ["GBP"]], ["¥", ["JPY", "CNY"]]] as const) {
    if (text.includes(symbol) && !(currencies as readonly string[]).includes(currency)) throw new FinanceValidationError("Amount currency symbol differs from the selected currency.");
  }
  text = text.replace(/[A-Za-z]{3}/g, "").replace(/[$€£¥]/g, "").trim();
  if (text.endsWith("-")) text = `-${text.slice(0, -1).trim()}`;
  const parentheses = /^\(.*\)$/.test(text);
  if (parentheses) text = text.slice(1, -1).trim();
  let negative = text.startsWith("-");
  if (text.startsWith("-") || text.startsWith("+")) text = text.slice(1).trim();
  if (parentheses && negative) throw new FinanceValidationError("Use either parentheses or a minus sign, not both.");
  negative ||= parentheses;
  const parts = text.split(decimal), group = decimal === "." ? "," : ".";
  if (parts.length > 2 || (parts.length === 2 && !/^\d{1,4}$/.test(parts[1]))) throw new FinanceValidationError("Invalid decimal amount or more than four decimal places.");
  const integer = parts[0], normalizedGroups = integer.replace(/ /g, group);
  const escaped = group === "." ? "\\." : ",";
  if (!/^\d+$/.test(integer) && !(new RegExp(`^\\d{1,3}(?:${escaped}\\d{3})+$`)).test(normalizedGroups)) throw new FinanceValidationError("Invalid thousands grouping for the selected number format.");
  const digits = normalizedGroups.split(group).join("").replace(/^0+(?=\d)/, ""), fraction = parts[1] ?? "";
  if (!digits) throw new FinanceValidationError("Amount is missing.");
  if (/^0+$/.test(digits) && (!fraction || /^0+$/.test(fraction))) return "0.0000";
  return decimalAmount(`${negative ? "-" : ""}${digits}${fraction ? `.${fraction}` : ""}`, true);
}
