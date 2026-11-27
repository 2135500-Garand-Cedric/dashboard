import { requireOwnerPage } from "@/lib/accounts/owner-page";
import SettingsSection from "@/components/settings/SettingsSection";
import BirthdaySettings from "@/components/calendar/BirthdaySettings";
export default async function Page() {
  await requireOwnerPage();
  return (
    <SettingsSection title="Birthdays">
      <BirthdaySettings />
    </SettingsSection>
  );
}
