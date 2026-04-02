import { defineConfig, devices } from '@playwright/test';

/**
 * Admin App E2E Tests
 *
 * Prerequisites:
 *   1. Server running on :3000  (Django or Node)
 *   2. Admin app running on :5174  (cd apps/admin && npm run dev)
 */
export default defineConfig({
    testDir: '.',
    fullyParallel: false,
    retries: 1,
    timeout: 30_000,
    expect: { timeout: 10_000 },

    use: {
        baseURL: 'http://localhost:5174',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
