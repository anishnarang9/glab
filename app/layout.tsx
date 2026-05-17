// P2 — root layout (Next.js app router)
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTeam",
  description: "Your team's collective memory",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head />
      <body className="bg-[#f7f6ff] text-indigo-950 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
