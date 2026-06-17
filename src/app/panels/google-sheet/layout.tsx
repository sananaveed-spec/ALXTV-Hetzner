import type { Metadata } from "next";
import "./google-sheet.css";

export const metadata: Metadata = {
  title: "Google Sheet Panel",
};

export default function GoogleSheetPanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
