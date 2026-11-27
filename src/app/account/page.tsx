import { redirect } from "next/navigation";
// Preserve existing sign-in callbacks/bookmarks after moving account preferences.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  redirect(`/settings/account${(await searchParams).denied === "1" ? "?denied=1" : ""}`);
}
