import SettingsSection from "@/components/settings/SettingsSection";
import HolidaySettings from "@/components/calendar/HolidaySettings";
export default function Page() {
  return (
    <SettingsSection title="Calendar holidays">
      <HolidaySettings />
    </SettingsSection>
  );
}
