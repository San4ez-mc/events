import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Політика конфіденційності — Кіро", alternates: { canonical: "/privacy" } };

export default function Page() {
  return <LegalPage slug="privacy" />;
}
