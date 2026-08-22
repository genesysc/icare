import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "care·register",
    template: "%s · care·register",
  },
  description:
    "A UK health and social care recruitment marketplace. Free for candidates, always.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
