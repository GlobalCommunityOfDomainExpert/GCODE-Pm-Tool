import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
