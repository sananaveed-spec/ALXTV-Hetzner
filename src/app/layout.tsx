import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ALX TV",
  description: "Combined Clockify and Google Sheet kiosk display",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
