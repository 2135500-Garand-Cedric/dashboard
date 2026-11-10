import { Suspense } from "react";
import AllWork from "@/components/work/AllWork";
export default function TodosPage() {
  return <Suspense fallback={<p role="status">Loading work…</p>}><AllWork /></Suspense>;
}
