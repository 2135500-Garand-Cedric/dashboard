import ReconciliationWorkspace from "@/components/finance/ReconciliationWorkspace";
import { matchKind } from "@/lib/finance/reconciliation";
export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ kind?: string; source?: string }> }) {
  const params = await searchParams;
  let kind = "RECEIPT";
  try { kind = matchKind(params.kind ?? kind); } catch { /* Invalid optional links open the default list. */ }
  const source = params.source && /^[1-9]\d*$/.test(params.source) && Number(params.source) <= 2147483647 ? Number(params.source) : null;
  return <ReconciliationWorkspace key={`${kind}:${source}`} initialKind={kind} initialSource={source} />;
}
