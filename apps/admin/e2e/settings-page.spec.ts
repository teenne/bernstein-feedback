import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await page.getByPlaceholder('Enter admin password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
}

test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.getByRole('link', { name: 'Settings' }).click();
    });

    test('loads settings page with all sections', async ({ page }) => {
        await expect(page.getByText('Configuration')).toBeVisible();
        await expect(page.getByText('Subscription Status')).toBeVisible();
        await expect(page.getByText('Storage Adapter')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
        await expect(page.getByText('Diagnostics Limits')).toBeVisible();
    });

    test('shows subscription status (Free or Pro)', async ({ page }) => {
        const freeOrPro = page.getByText(/Free Tier|Pro Plan Active/);
        await expect(freeOrPro).toBeVisible();
    });

    test('adapter selector shows three options', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Local' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Supabase' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Console' })).toBeVisible();
    });

    test('theme mode toggle switches between light and dark', async ({ page }) => {
        const darkBtn = page.getByRole('button', { name: 'Dark' });
        const lightBtn = page.getByRole('button', { name: 'Light' });

        await expect(darkBtn).toBeVisible();
        await expect(lightBtn).toBeVisible();

        await darkBtn.click();
        const hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(hasDark).toBe(true);

        await lightBtn.click();
        const hasDarkAfter = await page.evaluate(() => document.documentElement.classList.contains('dark'));
        expect(hasDarkAfter).toBe(false);
    });

    test('shows branding toggle', async ({ page }) => {
        await expect(page.getByText('Show Branding')).toBeVisible();
        await expect(page.getByText("Display 'Powered by Bernstein'")).toBeVisible();
    });

    test('unsaved changes banner appears on setting change', async ({ page }) => {
        await page.getByRole('button', { name: 'Dark' }).click();

        await expect(page.getByText('Unsaved changes')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();

        await page.getByRole('button', { name: 'Light' }).click();
    });
});
