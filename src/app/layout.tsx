import { AccessProvider } from "@/context/AccessContext";
import { JAPANESE_CAPABILITIES } from "@/lib/accounts/capabilities";
import AuthBoundary from "@/components/accounts/AuthBoundary";
import MemberShell from "@/components/MemberShell";
import { getActor } from "@/lib/accounts/access";
import { APP_TIME_ZONE } from "@/lib/app-time-zone";
import { Geist, Geist_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "Dashboard",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Dashboard", statusBarStyle: "default" },
  icons: { icon: "/icons/dashboard-192.png", apple: "/icons/dashboard-180.png" },
};

export const viewport = { themeColor: "#0f172a" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {actor?.role === "OWNER" ? (
          <AuthBoundary userId={actor.id} sessionId={actor.sessionId}>
            <AccessProvider
              permissions={actor.role === "OWNER" ? JAPANESE_CAPABILITIES : actor.permissions}
            >
              <AppShell
                key={`${actor.id}:${actor.sessionId}`}
                timeZone={actor.timeZone || APP_TIME_ZONE}
              >
                {children}
              </AppShell>
            </AccessProvider>
          </AuthBoundary>
        ) : actor ? (
          <AuthBoundary userId={actor.id} sessionId={actor.sessionId}>
            <AccessProvider
              permissions={actor.role === "OWNER" ? JAPANESE_CAPABILITIES : actor.permissions}
            >
              <MemberShell
                key={`${actor.id}:${actor.sessionId}`}
                permissions={actor.permissions}
                timeZone={actor.timeZone || APP_TIME_ZONE}
              >
                {children}
              </MemberShell>
            </AccessProvider>
          </AuthBoundary>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
