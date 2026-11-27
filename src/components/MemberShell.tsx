import SideMenu from "@/components/SideMenu";
import { SettingsProvider } from "@/context/SettingsContext";
import { ViewStateProvider } from "@/context/ViewStateContext";
import { SnackbarProvider } from "@/context/SnackbarContext";
import { MemoryProvider } from "@/context/MemoryContext";
export default function MemberShell({
  children,
  timeZone,
  permissions,
}: {
  children: React.ReactNode;
  timeZone: string;
  permissions: string[];
}) {
  return (
    <SettingsProvider initialTimeZone={timeZone}>
      <ViewStateProvider>
        <SnackbarProvider>
          <MemoryProvider>
            <div className="app-shell flex min-h-dvh">
              <SideMenu memberPermissions={permissions} />
              <main className="min-w-0 flex-1 px-4 pb-4 pt-20 md:p-6">{children}</main>
            </div>
          </MemoryProvider>
        </SnackbarProvider>
      </ViewStateProvider>
    </SettingsProvider>
  );
}
