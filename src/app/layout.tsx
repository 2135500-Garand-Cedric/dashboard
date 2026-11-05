import { Geist, Geist_Mono } from "next/font/google";
import { getServerSession } from "next-auth/next";
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
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {isOwnerSession(session) ? <AppShell>{children}</AppShell> : children}
      </body>
    </html>
  );
}
