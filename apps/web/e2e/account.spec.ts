import { expect, test } from "@playwright/test";

/** Needs the API + DB behind the web app. Uses a throw-away account per run. */
test("register → onboarding → edit profile → profile persists", async ({ page }) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `e2e-${stamp}@example.com`;

  await page.goto("/register");
  await page.getByLabel(/Ім'я|Name/i).first().fill("E2E Тестер");
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Пароль|Password/i).first().fill("Str0ngPass-e2e");
  await page.getByRole("button", { name: /Зареєструватися|Sign up|Register/i }).click();

  // §2 onboarding, skippable
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByRole("button", { name: /Пропустити|Skip/i }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: /Профіль|Profile/i })).toBeVisible();
  const bio = page.getByLabel(/Про себе|Bio/i);
  await bio.fill("Люблю настільні ігри");
  await page.getByRole("button", { name: /Зберегти|Save/i }).click();
  await expect(page.getByText(/Збережено|Saved/i)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(/Про себе|Bio/i)).toHaveValue("Люблю настільні ігри");
});
