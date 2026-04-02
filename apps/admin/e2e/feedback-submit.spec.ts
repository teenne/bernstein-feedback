import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await page.getByPlaceholder('Enter admin password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
}

test.describe('Feedback Widget — Submit Flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('floating feedback button is visible', async ({ page }) => {
        const feedbackBtn = page.getByRole('button', { name: 'Send feedback' });
        await expect(feedbackBtn).toBeVisible();
    });

    test('clicking feedback button opens the dialog', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();

        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Feedback' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Feature' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Bug' })).toBeVisible();
    });

    test('submit general feedback', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();

        await page.locator('#feedback-title').fill('E2E Test Feedback');
        await page.locator('#feedback-description').fill('Automated test feedback submission');

        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('/api/feedback') && resp.request().method() === 'POST'
        );

        await page.getByRole('button', { name: 'Send' }).click();
        const response = await responsePromise;

        expect(response.status()).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.id).toBeTruthy();
    });

    test('submit bug report with impact', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();

        await page.getByRole('tab', { name: 'Bug' }).click();
        await expect(page.getByLabel('What went wrong?')).toBeVisible();

        await page.locator('#feedback-title').fill('E2E Bug Report');
        await page.getByRole('button', { name: 'Annoying' }).click();
        await page.locator('#feedback-description').fill('This bug is annoying');

        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('/api/feedback') && resp.request().method() === 'POST'
        );

        await page.getByRole('button', { name: 'Send' }).click();
        const response = await responsePromise;
        expect(response.status()).toBe(201);
    });

    test('submit feature request', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();

        await page.getByRole('tab', { name: 'Feature' }).click();
        await expect(page.getByLabel('What would you like?')).toBeVisible();

        await page.locator('#feedback-title').fill('E2E Feature Request');
        await page.locator('#feedback-description').fill('Would be nice to have this');

        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('/api/feedback') && resp.request().method() === 'POST'
        );

        await page.getByRole('button', { name: 'Send' }).click();
        const response = await responsePromise;
        expect(response.status()).toBe(201);
    });

    test('cancel closes dialog without submitting', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();

        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).not.toBeVisible();
    });

    test('close button (X) closes dialog', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();

        await page.getByLabel('Close').click();
        await expect(page.locator('[data-bernstein-dialog-content]')).not.toBeVisible();
    });

    test('send button is disabled when title is empty', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();

        const sendBtn = page.getByRole('button', { name: 'Send' });
        await expect(sendBtn).toBeDisabled();

        await page.locator('#feedback-title').fill('Something');
        await expect(sendBtn).toBeEnabled();
    });

    test('consent toggles are present and interactive', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();

        await expect(page.getByText("We'll include:")).toBeVisible();
        await expect(page.getByText('Technical details')).toBeVisible();
        await expect(page.getByText('Recent steps')).toBeVisible();
        await expect(page.getByText('Your email')).toBeVisible();
    });

    test('email input appears when email toggle is enabled', async ({ page }) => {
        await page.getByRole('button', { name: 'Send feedback' }).click();
        await expect(page.locator('[data-bernstein-dialog-content]')).toBeVisible();

        const emailToggle = page.getByText('Your email').locator('..').locator('..').locator('button[role="switch"]');
        await emailToggle.click();

        await expect(page.getByPlaceholder('your@email.com')).toBeVisible();
    });
});
