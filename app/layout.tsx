import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quiz System",
  description: "Standalone teacher quiz system with AI generation and public quiz links."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
