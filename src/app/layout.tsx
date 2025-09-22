import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "./api/auth/[...nextauth]/route";
import SideMenu from "@/components/SideMenu";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Check if user is authenticated
  const session = await getServerSession(authOptions);

  if (!session) {
    // Automatically redirect to GitHub sign-in
    redirect("/api/auth/signin");
  }

  // If authenticated, render the app
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex">
          <SideMenu />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
