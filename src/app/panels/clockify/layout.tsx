import type { Metadata } from "next";
import "./clockify.css";

export const metadata: Metadata = {
  title: "Timesheets Panel",
};

export default function ClockifyPanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
