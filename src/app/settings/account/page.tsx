import { getActor } from "@/lib/accounts/access";
import { redirect } from "next/navigation";
import SettingsSection from "@/components/settings/SettingsSection";
import AccountForm from "@/components/accounts/AccountForm";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  if (!(await getActor())) redirect("/signin");
  return (
    <SettingsSection title="My account">
      <AccountForm hideTitle accessDenied={(await searchParams).denied === "1"} />
    </SettingsSection>
  );
}
