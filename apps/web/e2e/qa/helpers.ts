import type { Page } from "@playwright/test";

export interface PageIssues {
  consoleErrors: string[];
  failedRequests: string[];
}

/**
 * Attaches console.error / failed-network-request collectors to a page.
 * Call this right after the page/context is created and inspect the
 * returned arrays after navigation+interaction to report findings.
 */
export function trackPageIssues(page: Page): PageIssues {
  const issues: PageIssues = { consoleErrors: [], failedRequests: [] };

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      issues.consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    issues.consoleErrors.push(`pageerror: ${err.message}`);
  });

  page.on("response", (res) => {
    if (res.status() >= 500) {
      issues.failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });

  return issues;
}

/** Regex used to catch untranslated i18n keys leaking into rendered text, e.g. "events.wizard.title". */
export const RAW_I18N_KEY_RE = /\b[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*\b/;

/** Catches literal "undefined" / "[object Object]" leaking into rendered text. */
export const UNDEFINED_LEAK_RE = /\bundefined\b|\[object /;

export async function assertNoHorizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Logs in via the real UI form (email/password), asserting we land away from /login. */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Пароль|Password/i).fill(password);
  await page.getByRole("button", { name: /Увійти|Log ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

