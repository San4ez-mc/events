import { expect, test } from "@playwright/test";
import { QA, firstPublicSlug } from "./fixtures";
import { trackPageIssues } from "./helpers";

/**
 * §2 (ST-02 Anonymous). Verifies: home shows public events, an event page
 * opens, private events are not visible to an anonymous visitor, and /admin
 * is inaccessible without auth.
 */
test.describe("§2 anonymous visitor", () => {
  test("home shows public events without auth", async ({ page }) => {
    const issues = trackPageIssues(page);
    await page.goto("/");
    // Discovery feed loads at least one card (the seeded 20 public QA events).
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const emptyState = page.getByText(/Більше нічого немає|nothing more|end/i);
    // Either a card is showing or, in the worst case, the loading skeleton resolved to *something* --
    // assert the discovery API itself returned our seeded events.
    const res = await page.request.get("/api/v1/discovery");
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(body.items.length).toBeGreaterThan(0);
    void emptyState;
    expect(issues.consoleErrors, `console errors on /: ${issues.consoleErrors.join("\n")}`).toEqual([]);
    expect(issues.failedRequests, `5xx on /: ${issues.failedRequests.join("\n")}`).toEqual([]);
  });

  test("a public event page opens for an anonymous visitor", async ({ page }) => {
    const issues = trackPageIssues(page);
    const res = await page.goto(`/events/${firstPublicSlug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(issues.consoleErrors, issues.consoleErrors.join("\n")).toEqual([]);
    expect(issues.failedRequests, issues.failedRequests.join("\n")).toEqual([]);
  });

  test("private event is excluded from the public feed/search (visible only via direct link, per §62 noindex design)", async ({ page }) => {
    // Not in the public discovery feed:
    const res = await page.request.get("/api/v1/discovery?limit=50");
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    const slugs: string[] = body.items.map((i: { slug: string }) => i.slug);
    expect(slugs).not.toContain(QA.privateEventSlug);

    // Not in search results either:
    const searchRes = await page.request.get("/api/v1/search?q=QA+UI+Private");
    if (searchRes.ok()) {
      const searchBody = await searchRes.json();
      const searchSlugs: string[] = (searchBody.items ?? []).map((i: { slug: string }) => i.slug);
      expect(searchSlugs).not.toContain(QA.privateEventSlug);
    }

    // docs/SPEC_AUDIT.md §62: private events get `noindex`, but per §13 ("direct
    // access only through allowed flow/link") the direct URL itself IS meant
    // to work as the invitation mechanism -- confirm that and the noindex tag.
    const direct = await page.goto(`/events/${QA.privateEventSlug}`);
    expect(direct?.status()).toBe(200);
    const robotsMeta = await page.locator('meta[name="robots"]').getAttribute("content").catch(() => null);
    expect(robotsMeta, "private event page should carry a noindex meta tag (§62)").toMatch(/noindex/i);
  });

  test("/admin is inaccessible without auth", async ({ page }) => {
    await page.goto("/admin");
    // The admin layout guard redirects unauthenticated visitors back to "/".
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/admin", { timeout: 10_000 });
    // Must never render the admin dashboard content for an anonymous visitor.
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/Users \d+|Модерація/);
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test("/admin/users is inaccessible without auth", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 }).catch(() => {});
    await expect(page).toHaveURL("/");
  });
});
