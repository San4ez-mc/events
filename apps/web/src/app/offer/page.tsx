import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Публічна оферта — Кіро", alternates: { canonical: "/offer" } };

export default function Page() {
  return <LegalPage slug="offer" />;
}
