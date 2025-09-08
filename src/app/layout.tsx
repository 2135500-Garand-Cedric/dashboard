import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SideMenu from "@/components/SideMenu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Dashoboard for Cedric",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex">
          <SideMenu />
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </body>
    </html>

  );
}
