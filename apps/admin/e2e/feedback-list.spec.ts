import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/');
    await page.getByPlaceholder('Enter admin password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('heading', { name: 'Feedback' })).toBeVisible();
}

test.describe('Feedback List Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('displays feedback table with correct columns', async ({ page }) => {
        const headers = page.locator('th');
        await expect(headers.filter({ hasText: 'Type' })).toBeVisible();
        await expect(headers.filter({ hasText: 'Title' })).toBeVisible();
        await expect(headers.filter({ hasText: 'Project' })).toBeVisible();
        await expect(headers.filter({ hasText: 'Severity' })).toBeVisible();
        await expect(headers.filter({ hasText: 'Files' })).toBeVisible();
        await expect(headers.filter({ hasText: 'Time' })).toBeVisible();
    });

    test('shows item count', async ({ page }) => {
        const countText = page.getByText(/\d+ items?|No feedback yet/);
        await expect(countText).toBeVisible();
    });

    test('refresh button reloads data', async ({ page }) => {
        const refreshBtn = page.getByRole('button', { name: 'Refresh' });
        await expect(refreshBtn).toBeVisible();

        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('/api/feedback') && resp.request().method() === 'GET'
        );
        await refreshBtn.click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
    });

    test('type filter sends correct query param', async ({ page }) => {
        const select = page.locator('select');
        await expect(select).toBeVisible();

        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('type=bug_report')
        );
        await select.selectOption('bug_report');
        const response = await responsePromise;
        expect(response.status()).toBe(200);
    });

    test('project filter sends correct query param', async ({ page }) => {
        const input = page.getByPlaceholder('Filter by project_id...');
        await expect(input).toBeVisible();

        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('project_id=test-project')
        );
        await input.fill('test-project');
        const response = await responsePromise;
        expect(response.status()).toBe(200);
    });

    test('clicking a row navigates to detail page', async ({ page }) => {
        const firstRow = page.locator('tbody tr').first();
        const hasRows = await firstRow.isVisible().catch(() => false);

        if (hasRows) {
            await firstRow.click();
            await expect(page).toHaveURL(/\/feedback\/[0-9a-f-]+/);
            await expect(page.getByText('← Back to list')).toBeVisible();
        }
    });

    test('files column shows indicator for each row', async ({ page }) => {
        // Wait for table to load
        await page.waitForResponse(resp =>
            resp.url().includes('/api/feedback') && resp.request().method() === 'GET'
        );

        const rows = page.locator('tbody tr');
        const rowCount = await rows.count();

        if (rowCount > 0) {
            // The 5th td in each row is the Files column — should have content
            const filesCell = rows.first().locator('td').nth(4);
            await expect(filesCell).not.toBeEmpty();
        }
    });
});
