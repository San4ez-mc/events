import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Контакти та реквізити — Кіро", alternates: { canonical: "/contacts" } };

export default function Page() {
  return <LegalPage slug="contacts" />;
}
