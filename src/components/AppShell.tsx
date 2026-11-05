import SideMenu from "@/components/SideMenu";
import { SnackbarProvider } from "@/context/SnackbarContext";
import { MusicPlayerProvider } from "@/context/MusicPlayerContext";
import { MemoryProvider } from "@/context/MemoryContext";

// Mounted in the root layout so navigation preserves the player and its iframe.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SnackbarProvider>
        <MusicPlayerProvider>
          <MemoryProvider>
            <div className="flex">
              <SideMenu />
              <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
            </div>
          </MemoryProvider>
        </MusicPlayerProvider>
      </SnackbarProvider>
    </>
  );
}
