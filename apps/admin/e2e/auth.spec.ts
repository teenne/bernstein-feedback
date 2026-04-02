import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test.beforeEach(async ({ page }) => {
        // Clear session so each test starts logged out
        await page.context().clearCookies();
        await page.goto('/');
        await page.evaluate(() => sessionStorage.clear());
        await page.goto('/');
    });

    test('shows login page when not authenticated', async ({ page }) => {
        await expect(page.getByText('Welcome Back')).toBeVisible();
        await expect(page.getByPlaceholder('Enter admin password')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('rejects invalid password', async ({ page }) => {
        await page.getByPlaceholder('Enter admin password').fill('wrong-password');
        await page.getByRole('button', { name: 'Sign In' }).click();
        await expect(page.getByText('Invalid password')).toBeVisible();
    });

    test('logs in with correct password and shows dashboard', async ({ page }) => {
        await page.getByPlaceholder('Enter admin password').fill('admin');
        await page.getByRole('button', { name: 'Sign In' }).click();

        // Should redirect to feedback list
        await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
        // Nav should be visible
        await expect(page.getByRole('link', { name: 'Feedback' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Stats' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Demo' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    });

    test('sign out returns to login page', async ({ page }) => {
        // Login first
        await page.getByPlaceholder('Enter admin password').fill('admin');
        await page.getByRole('button', { name: 'Sign In' }).click();
        await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();

        // Sign out
        await page.getByText('Sign out').click();
        await expect(page.getByText('Welcome Back')).toBeVisible();
    });
});
