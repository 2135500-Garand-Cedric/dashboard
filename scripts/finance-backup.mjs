import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const tables = ["FinancialAccount", "FinanceCategory", "FinancialTransaction", "FinancialTransfer", "FinancialReceipt", "FinancialIncomeRecord", "FinancialDocument", "FinancialImport", "FinancialImportEntry", "FinancialIncomeSource", "FinancialDeductionType", "FinancialIncomeDeduction", "FinancialMatch", "FinancialMatchEvent", "FinancialExampleDataset"];
const snapshots = tables.map(table => `'${table}', (SELECT json_build_object('count', count(*), 'hash', md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), ''))) FROM "${table}" t)`);
const snapshotSql = `SET TIME ZONE 'UTC'; SELECT json_build_object(${snapshots.join(",")})`;
const documentsSql = `SELECT coalesce(json_agg(json_build_object('key', "storageKey", 'size', "byteSize", 'hash', "contentHash") ORDER BY "storageKey"), '[]') FROM "FinancialDocument"`;
function run(args, { input, output, env } = {}) {
  let incoming, outgoing;
  try {
    if (input) incoming = fs.openSync(input, "r");
    if (output) outgoing = fs.openSync(output, "wx", 0o600);
    const result = spawnSync("docker", args, { stdio: [incoming ?? "ignore", outgoing ?? "pipe", "pipe"], env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
    // Do not print child errors: PostgreSQL diagnostics can include record values.
    if (result.error || result.status !== 0) throw new Error(`Docker ${args[0]} failed. Check Docker access, available disk space, and the selected Compose services. Detailed database output was withheld.`);
    return result.stdout?.toString().trim() ?? "";
  } finally { if (incoming !== undefined) fs.closeSync(incoming); if (outgoing !== undefined) fs.closeSync(outgoing); }
}
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function filesIn(root) {
  return fs.readdirSync(root, { withFileTypes: true }).map(entry => {
    const stat = fs.lstatSync(path.join(root, entry.name));
    if (!stat.isFile() || !/^[a-f0-9-]{36}\.(jpg|png|webp|gif|pdf|csv)$/.test(entry.name)) throw new Error("Backup contains an unexpected document path or symbolic link.");
    return { key: entry.name, size: stat.size, hash: digest(path.join(root, entry.name)) };
  }).sort((a, b) => a.key.localeCompare(b.key));
}
function checkDocuments(root, records) {
  const files = filesIn(root), byKey = new Map(files.map(file => [file.key, file]));
  for (const record of records) {
    const file = byKey.get(record.key);
    if (!file || file.size !== record.size || (record.hash && file.hash !== record.hash)) throw new Error("A referenced document is missing or differs from its database metadata. Repair storage before relying on this backup.");
  }
  return files;
}
export function backup(composeFile, destination) {
  const requested = path.resolve(destination), root = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested)), publicRoot = fs.realpathSync("public"), privateRoot = path.resolve(process.env.FINANCE_UPLOAD_DIR || "private/finance");
  for (const forbidden of [publicRoot, privateRoot]) if (root === forbidden || root.startsWith(`${forbidden}${path.sep}`)) throw new Error("Store backups outside public files and the live document directory.");
  // Refuse to replace any existing backup, and prevent permissive parent-directory defaults.
  fs.mkdirSync(root, { mode: 0o700 }); fs.chmodSync(root, 0o700);
  const compose = ["compose", "-f", path.resolve(composeFile)];
  const container = run([...compose, "ps", "-a", "-q", "dashboard"]);
  if (!/^[a-f0-9]{12,64}$/.test(container)) throw new Error("Choose a Compose project with exactly one existing dashboard container.");
  const running = run(["inspect", "--format", "{{.State.Running}}", container]) === "true";
  const sql = query => {
    const output = run([...compose, "exec", "-T", "dashboard-db", "sh", "-c", 'psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"', "finance-backup", query]);
    return JSON.parse(output);
  };
  try {
    if (running) run([...compose, "stop", "dashboard"]);
    const snapshot = sql(snapshotSql), documents = sql(documentsSql);
    run([...compose, "exec", "-T", "dashboard-db", "sh", "-c", 'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { output: path.join(root, "database.dump") });
    const target = path.join(root, "documents"); fs.mkdirSync(target, { mode: 0o700 });
    run(["cp", `${container}:/app/private/finance/.`, target]);
    const files = checkDocuments(target, documents);
    for (const file of files) fs.chmodSync(path.join(target, file.key), 0o600);
    fs.chmodSync(target, 0o700);
    const manifest = { version: 1, createdAt: new Date().toISOString(), postgresMajor: 15, databaseHash: digest(path.join(root, "database.dump")), snapshot, documents, files };
    fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
    console.log(`Backup complete: ${documents.length} referenced private documents; database and file checksums saved. Keep this directory encrypted and off the web server.`);
  } finally { if (running) run([...compose, "start", "dashboard"]); }
}
export async function verify(source) {
  const root = path.resolve(source), manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || manifest.postgresMajor !== 15 || digest(path.join(root, "database.dump")) !== manifest.databaseHash) throw new Error("Backup manifest or database checksum is invalid.");
  if (JSON.stringify(checkDocuments(path.join(root, "documents"), manifest.documents)) !== JSON.stringify(manifest.files)) throw new Error("Document checksum verification failed.");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "finance-restore-")); fs.chmodSync(scratch, 0o700);
  const password = randomUUID(); let container;
  try {
    // Only this newly created, network-isolated PostgreSQL instance is ever restored into.
    container = run(["run", "--detach", "--network", "none", "--label", "dashboard.finance-restore-test=true", "--env", "POSTGRES_PASSWORD", "postgres:15"], { env: { POSTGRES_PASSWORD: password } });
    if (!/^[a-f0-9]{64}$/.test(container)) throw new Error("Could not identify isolated restore container.");
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" });
      if (result.status === 0) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error("Isolated restore database did not become ready.");
    run(["exec", "-i", container, "pg_restore", "--no-owner", "--no-privileges", "--exit-on-error", "-U", "postgres", "-d", "postgres"], { input: path.join(root, "database.dump") });
    const sql = query => JSON.parse(run(["exec", container, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", query]));
    if (JSON.stringify(sql(snapshotSql)) !== JSON.stringify(manifest.snapshot)) throw new Error("Restored finance tables differ from their backup snapshot.");
    fs.cpSync(path.join(root, "documents"), path.join(scratch, "documents"), { recursive: true, errorOnExist: true, force: false });
    if (JSON.stringify(checkDocuments(path.join(scratch, "documents"), sql(documentsSql))) !== JSON.stringify(manifest.files)) throw new Error("Restored document volume differs from its backup.");
    console.log(`Restore verified: all ${tables.length} finance tables and ${manifest.documents.length} referenced documents match. Live databases and uploads were not modified.`);
  } finally {
    if (container && /^[a-f0-9]{64}$/.test(container)) run(["rm", "--force", "--volumes", container]);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, first, second] = process.argv.slice(2);
  try {
    if (command === "backup" && first && second && process.argv.length === 5) backup(first, second);
    else if (command === "verify" && first && process.argv.length === 4) await verify(first);
    else throw new Error("Usage: node scripts/finance-backup.mjs backup <compose.yml> <new-private-directory> | verify <backup-directory>");
  } catch (error) { console.error(error instanceof Error ? error.message : "Finance backup failed."); process.exitCode = 1; }
}
