import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// next/font self-hosts Inter at build time (no runtime request to
// fonts.googleapis.com, no render-blocking external stylesheet, no
// layout-shift-causing FOUT/FOIT) instead of the <link> tags this replaced.
// tailwind.config.ts's fontFamily.sans reads this variable.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gcode PM Tool",
  description: "Workspaces + Onboarding & Team Management",
};

// Deliberately bare - the app chrome (Sidebar/Header, behind an auth guard)
// lives in (app)/layout.tsx, and (auth) pages (login/register/invite/join)
// render full-bleed with none of it. Splitting it out here is what lets both
// coexist without either route group fighting the other for the shell.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
