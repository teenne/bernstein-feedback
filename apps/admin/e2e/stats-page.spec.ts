import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await page.getByPlaceholder('Enter admin password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
}

test.describe('Stats Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.getByRole('link', { name: 'Stats' }).click();
    });

    test('loads stats page with total count', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
        await expect(page.getByText('Total Feedback')).toBeVisible();
    });

    test('shows breakdown by type section', async ({ page }) => {
        await expect(page.getByText('By Type')).toBeVisible();
    });

    test('shows breakdown by severity section', async ({ page }) => {
        await expect(page.getByText('By Severity')).toBeVisible();
    });

    test('stats API returns successfully', async ({ page }) => {
        // Navigate away and back to trigger a fresh stats API call
        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('/api/feedback/stats/summary')
        );

        await page.getByRole('link', { name: 'Feedback' }).click();
        await page.getByRole('link', { name: 'Stats' }).click();

        const response = await responsePromise;
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.total).toBeGreaterThanOrEqual(0);
    });
});
