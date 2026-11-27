import { requireOwnerPage } from "@/lib/accounts/owner-page";
import SettingsSection from "@/components/settings/SettingsSection";
import EmailSettings from "@/components/settings/EmailSettings";
export default async function Page() {
  await requireOwnerPage();
  return (
    <SettingsSection title="Email">
      <EmailSettings />
    </SettingsSection>
  );
}
