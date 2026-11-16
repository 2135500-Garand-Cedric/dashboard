import Link from "next/link";
import ContactManager from "@/components/work/ContactManager";

export default function WorkDirectoryPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 pt-12 md:pt-2">
      <Link href="/todos" className="inline-block rounded border border-card-border px-4 py-2">
        ← All Work
      </Link>
      <h1 className="text-2xl font-bold">Contacts</h1>
      <ContactManager />
    </div>
  );
}
