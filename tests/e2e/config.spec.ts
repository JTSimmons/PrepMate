import { expect, test } from '@playwright/test';

test('shows a useful setup state when Supabase environment is missing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PrepMate' })).toBeVisible();
  await expect(page.getByText('Supabase is not configured')).toBeVisible();
});
