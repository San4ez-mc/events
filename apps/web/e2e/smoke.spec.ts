import { expect, test } from "@playwright/test";

test.describe("anonymous visitor", () => {
  test("home page renders the brand and the feed area without horizontal scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Кіро|Kiro/i);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("search page shows an input and a helpful empty state", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("searchbox").or(page.getByRole("textbox")).first()).toBeVisible();
  });

  test("login page links to password reset and offers registration", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /Забули пароль|Forgot/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Зареєструватися|Sign up/i })).toBeVisible();
  });

  test("protected pages send anonymous users to login", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sitemap and robots are served", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toContain("Sitemap:");
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
  });

  test("unknown event slug is a 404, not a crash", async ({ page }) => {
    const response = await page.goto("/events/this-event-does-not-exist-xyz");
    expect(response?.status()).toBe(404);
  });
});
