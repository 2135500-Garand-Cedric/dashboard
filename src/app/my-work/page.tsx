import { Suspense } from "react";
import MyWork from "@/components/work/MyWork";
export default function MyWorkPage() {
  return (
    <Suspense fallback={<p role="status">Loading My Work…</p>}>
      <MyWork />
    </Suspense>
  );
}
