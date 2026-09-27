import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Умови користування — Кіро", alternates: { canonical: "/terms" } };

export default function Page() {
  return <LegalPage slug="terms" />;
}
