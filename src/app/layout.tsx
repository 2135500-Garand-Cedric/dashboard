import { Geist, Geist_Mono } from "next/font/google";
import { getServerSession } from "next-auth/next";
import { readUserSettings } from "@/lib/user-settings";
import AppShell from "@/components/AppShell";
import { authOptions } from "@/lib/auth";
import { isOwnerSession } from "@/lib/owner-policy";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "Dashboard",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const settings = isOwnerSession(session) ? await readUserSettings() : null;
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {isOwnerSession(session) ? (
          <AppShell timeZone={settings!.timeZone}>{children}</AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
