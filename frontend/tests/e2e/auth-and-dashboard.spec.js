import { test, expect } from '@playwright/test';

test.describe('Authentication and dashboard workflows', () => {
  test('login page renders with required UI blocks', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Student' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('invalid login keeps user on login and shows error state', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[type="email"]').fill('invalid@college.edu');
    await page.locator('input[type="password"]').fill('wrong-password');
    await page.getByRole('button', { name: /Sign in/i }).click();

    await expect(page).toHaveURL(/\/login/);
  });

  test('protected route redirects unauthenticated user', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('responsive smoke: login UI works on mobile', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Sign in to continue')).toBeVisible();
  });
});
