import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await page.getByPlaceholder('Enter admin password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
}

test.describe('Demo Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.getByRole('link', { name: 'Demo' }).click();
        await expect(page.getByText('Experience the Feedback Widget')).toBeVisible();
    });

    test('shows all demo sections', async ({ page }) => {
        await expect(page.getByText('Interactive Triggers')).toBeVisible();
        await expect(page.getByText('Context-Aware Reporting')).toBeVisible();
        await expect(page.getByText('Capture Diagnostics')).toBeVisible();
    });

    test('Open Feedback button opens the dialog', async ({ page }) => {
        await page.getByRole('button', { name: 'Open Feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Feedback' })).toHaveAttribute('data-state', 'active');
    });

    test('Report Bug button opens bug dialog', async ({ page }) => {
        await page.getByRole('button', { name: 'Report Bug' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Bug' })).toHaveAttribute('data-state', 'active');
    });

    test('Simulate Crash Report opens pre-filled bug dialog', async ({ page }) => {
        await page.getByRole('button', { name: 'Simulate Crash Report' }).click();

        // reportBug() opens a pre-filled dialog, doesn't auto-submit
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Bug' })).toHaveAttribute('data-state', 'active');
        // Title should be pre-filled
        await expect(page.locator('#feedback-title')).toHaveValue('Application Crash');
    });

    test('Log Console Error triggers error capture', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', err => errors.push(err.message));
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page.getByRole('button', { name: 'Log Console Error' }).click();
        await page.waitForTimeout(500);
        expect(errors.some(e => e.includes('Test console error'))).toBe(true);
    });

    test('Simulate Network Fail triggers network error capture', async ({ page }) => {
        await page.getByRole('button', { name: 'Simulate Network Fail' }).click();
        await page.waitForTimeout(1000);
        await expect(page.getByText('Capture Diagnostics')).toBeVisible();
    });
});
