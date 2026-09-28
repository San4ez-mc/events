import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Повернення коштів — Кіро", alternates: { canonical: "/refund" } };

export default function Page() {
  return <LegalPage slug="refund" />;
}
