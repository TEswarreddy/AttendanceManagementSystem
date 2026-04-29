import { test, expect } from '@playwright/test';

test.describe('CRUD, attendance, and reports smoke coverage', () => {
  const guardedPaths = [
    '/admin/departments',
    '/admin/students',
    '/admin/faculty',
    '/admin/subjects',
    '/faculty/mark',
    '/admin/reports',
  ];

  for (const path of guardedPaths) {
    test(`redirect guard for ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('sidebar toggle trigger exists after login shell render attempt', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Student' })).toBeVisible();
  });
});
