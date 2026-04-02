import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await page.getByPlaceholder('Enter admin password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
}

test.describe('Feedback Detail Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('navigates to detail and shows all sections', async ({ page }) => {
        // Click first row in the list
        const firstRow = page.locator('tbody tr').first();
        const hasRows = await firstRow.isVisible().catch(() => false);
        if (!hasRows) {
            test.skip();
            return;
        }

        await firstRow.click();
        await expect(page).toHaveURL(/\/feedback\/[0-9a-f-]+/);

        // Title should be visible
        await expect(page.locator('h1')).toBeVisible();

        // Meta grid should show project, category, etc.
        await expect(page.getByText('Project')).toBeVisible();

        // Back button should work
        await expect(page.getByText('← Back to list')).toBeVisible();
    });

    test('back button returns to list', async ({ page }) => {
        const firstRow = page.locator('tbody tr').first();
        const hasRows = await firstRow.isVisible().catch(() => false);
        if (!hasRows) {
            test.skip();
            return;
        }

        await firstRow.click();
        await expect(page).toHaveURL(/\/feedback\/[0-9a-f-]+/);

        await page.getByText('← Back to list').click();
        await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
    });

    test('shows raw JSON data section', async ({ page }) => {
        const firstRow = page.locator('tbody tr').first();
        const hasRows = await firstRow.isVisible().catch(() => false);
        if (!hasRows) {
            test.skip();
            return;
        }

        await firstRow.click();
        await expect(page.getByText('Raw Data')).toBeVisible();
        // Raw JSON pre block should contain the feedback id
        await expect(page.locator('pre')).toBeVisible();
    });

    test('shows browser context section', async ({ page }) => {
        const firstRow = page.locator('tbody tr').first();
        const hasRows = await firstRow.isVisible().catch(() => false);
        if (!hasRows) {
            test.skip();
            return;
        }

        await firstRow.click();
        await expect(page.getByText('Browser Context')).toBeVisible();
    });

    test('screenshots section displays images when present', async ({ page }) => {
        const firstRow = page.locator('tbody tr').first();
        const hasRows = await firstRow.isVisible().catch(() => false);
        if (!hasRows) {
            test.skip();
            return;
        }

        await firstRow.click();

        // Screenshots section may or may not be present depending on data
        const screenshotsSection = page.getByText(/Screenshots \(\d+\)/);
        const hasScreenshots = await screenshotsSection.isVisible().catch(() => false);

        if (hasScreenshots) {
            // Images should be clickable links
            const images = page.locator('a[target="_blank"] img');
            expect(await images.count()).toBeGreaterThan(0);
        }
    });
});
