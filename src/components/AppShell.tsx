import PwaRegistration from "@/components/notifications/PwaRegistration";
import { SettingsProvider } from "@/context/SettingsContext";
import { ViewStateProvider } from "@/context/ViewStateContext";
import SideMenu from "@/components/SideMenu";
import { SnackbarProvider } from "@/context/SnackbarContext";
import { MusicPlayerProvider } from "@/context/MusicPlayerContext";
import { MemoryProvider } from "@/context/MemoryContext";

// Mounted in the root layout so navigation preserves the player and its iframe.
export default function AppShell({
  children,
  timeZone,
}: {
  children: React.ReactNode;
  timeZone: string;
}) {
  return (
    <>
      <PwaRegistration />
      <SettingsProvider initialTimeZone={timeZone}>
        <ViewStateProvider>
          <SnackbarProvider>
            <MusicPlayerProvider>
              <MemoryProvider>
                <div
                  className={`app-shell flex ${process.env.NODE_ENV === "development" ? "development-shell" : ""}`}
                >
                  <SideMenu />
                  <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
                </div>
              </MemoryProvider>
            </MusicPlayerProvider>
          </SnackbarProvider>
        </ViewStateProvider>
      </SettingsProvider>
    </>
  );
}
