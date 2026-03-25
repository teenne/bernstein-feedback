import { describe, it, expect, vi } from 'vitest';

import { FeedbackEventSchema } from '../schemas';

// Verify consoleAdapter location. In src/adapters/index.ts it says:
// export { localStorageAdapter, consoleAdapter ... } from './localStorage';
// So importing from '../adapters/localStorage' is correct if we want direct access, 
// or from '../adapters' if we want public API. Public API is better.
import { consoleAdapter as createConsoleAdapter } from '../adapters';

describe('Integration: Feedback Flow', () => {
    it('submits feedback via Console Adapter and logs correct JSON schema', async () => {
        // 1. Setup - Stub crypto and Spy on console
        vi.stubGlobal('crypto', { randomUUID: () => '1234-5678' });
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        // 2. Initialize Adapter
        const adapter = createConsoleAdapter();

        // 3. Create Valid Payload
        const payload = {
            type: 'bug_report',
            project_id: 'test-project',
            title: 'Integration Test Bug',
            description: 'Testing the console adapter',
            timestamp: new Date().toISOString(),
            context: {
                url: 'http://localhost:3000',
                userAgent: 'Vitest',
                viewport: { width: 1024, height: 768 },
                timestamp: new Date().toISOString(),
                consoleErrors: [],
                networkErrors: [],
                breadcrumbs: [],
            },
        };

        // 4. Execute
        // @ts-ignore - Payload is roughly matching but might miss optional fields for strict TS in test
        const result = await adapter.submit(payload);

        // 5. Verify Success
        expect(result.success).toBe(true);

        // 6. Verify Log Output
        expect(consoleSpy).toHaveBeenCalled();
        const loggedCall = consoleSpy.mock.calls.find(call => call[0] === 'Payload:');
        expect(loggedCall).toBeDefined();

        const loggedData = loggedCall?.[1];
        expect(loggedData).toBeDefined();

        // 7. Verify Schema Compliance
        // We parse the logged data with our Zod schema to ensure it's valid
        const parsed = FeedbackEventSchema.safeParse(loggedData);
        expect(parsed.success).toBe(true);
        if (!parsed.success) {
            console.error(parsed.error);
        }

        // Cleanup
        consoleSpy.mockRestore();
    });
});
