import { Suspense } from "react";
import SignIn from "@/components/accounts/SignIn";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading sign-in…</p>}>
      <SignIn />
    </Suspense>
  );
}
