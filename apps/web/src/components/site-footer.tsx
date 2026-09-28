import Link from "next/link";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/locale";
import { CONTACT_EMAIL } from "@/lib/legal-content";

/** Legal links + contact. Bottom margin leaves room for the fixed mobile bottom nav. */
export async function SiteFooter() {
  const uk =
    resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value) === "uk";
  return (
    <footer className="mb-16 border-t border-border px-4 py-6 text-sm text-muted sm:mb-0">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <span>© Кіро</span>
        <nav className="flex flex-wrap gap-4">
          <Link href="/privacy" className="hover:underline">
            {uk ? "Конфіденційність" : "Privacy"}
          </Link>
          <Link href="/terms" className="hover:underline">
            {uk ? "Умови" : "Terms"}
          </Link>
          <Link href="/account-deletion" className="hover:underline">
            {uk ? "Видалення акаунта" : "Account deletion"}
          </Link>
          <Link href="/offer" className="hover:underline">
            {uk ? "Оферта" : "Public Offer"}
          </Link>
          <Link href="/refund" className="hover:underline">
            {uk ? "Повернення коштів" : "Refunds"}
          </Link>
          <Link href="/contacts" className="hover:underline">
            {uk ? "Контакти" : "Contacts"}
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:underline">
            {CONTACT_EMAIL}
          </a>
        </nav>
      </div>
    </footer>
  );
}
