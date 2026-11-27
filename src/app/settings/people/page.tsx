import { requireOwnerPage } from "@/lib/accounts/owner-page";
import SettingsSection from "@/components/settings/SettingsSection";
import PeopleManager from "@/components/settings/PeopleManager";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ person?: string | string[] }>;
}) {
  await requireOwnerPage();
  const params = await searchParams;
  return (
    <SettingsSection title="People">
      <PeopleManager
        focusId={
          params.person === undefined
            ? undefined
            : typeof params.person === "string"
              ? params.person
              : "invalid"
        }
      />
    </SettingsSection>
  );
}
