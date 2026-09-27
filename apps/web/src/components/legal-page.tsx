import Link from "next/link";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/locale";
import { getLegalDoc, type LegalSlug } from "@/lib/legal-content";

/** Server-rendered legal document (indexable, no JS needed — Play Store reviewers open these URLs directly). */
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const doc = getLegalDoc(slug, locale);

  return (
    <article className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-3xl font-bold">{doc.title}</h1>
      <p className="mb-6 text-sm text-muted">{doc.updated}</p>
      <p className="mb-8 leading-relaxed">{doc.intro}</p>
      {doc.sections.map((section) => (
        <section key={section.heading} className="mb-7">
          <h2 className="mb-2 text-lg font-semibold">{section.heading}</h2>
          {section.paragraphs?.map((p) => (
            <p key={p} className="mb-2 leading-relaxed text-foreground/90">
              {p}
            </p>
          ))}
          {section.items && (
            <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-foreground/90">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <nav className="mt-10 flex flex-wrap gap-4 border-t border-border pt-4 text-sm text-muted">
        <Link href="/privacy" className="hover:underline">
          {locale === "uk" ? "Політика конфіденційності" : "Privacy Policy"}
        </Link>
        <Link href="/terms" className="hover:underline">
          {locale === "uk" ? "Умови користування" : "Terms of Use"}
        </Link>
        <Link href="/account-deletion" className="hover:underline">
          {locale === "uk" ? "Видалення акаунта" : "Account deletion"}
        </Link>
      </nav>
    </article>
  );
}
