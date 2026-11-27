import { requireOwnerPage } from "@/lib/accounts/owner-page";
import SettingsSection from "@/components/settings/SettingsSection";
import HolidaySettings from "@/components/calendar/HolidaySettings";
export default async function Page() {
  await requireOwnerPage();
  return (
    <SettingsSection title="Calendar holidays">
      <HolidaySettings />
    </SettingsSection>
  );
}
