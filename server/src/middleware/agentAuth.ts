import { Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { Project } from '../schemas/tables';

export interface AgentAuthContext {
    project_id: string;
    api_key: string;
}

/**
 * Authenticate a request against `projects.api_key` via the `X-API-Key`
 * header. Deliberately outside the user-JWT path so CI runners, coding
 * agents, and webhooks can call the Agent API without a browser session.
 *
 * Expects `req.params.projectId` on the route. The supplied key must
 * belong to that exact project — keys are per-project, not global.
 *
 * Sets `(req as any).agent = { project_id, api_key }` for downstream
 * handlers. Must run BEFORE `requirePlanFeature('api_access')` so the
 * 403 from a plan gate is only ever shown to authenticated callers.
 */
export async function requireProjectApiKey(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const projectId = req.params.projectId;
    if (!projectId) {
        res.status(400).json({ success: false, error: 'Project id missing from route' });
        return;
    }

    const headerKey = req.headers['x-api-key'];
    const apiKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;
    if (!apiKey || typeof apiKey !== 'string') {
        res.status(401).json({ success: false, error: 'Missing X-API-Key header' });
        return;
    }

    try {
        const result = await query<Pick<Project, 'id' | 'api_key'>>(
            'SELECT id, api_key FROM projects WHERE id = $1',
            [projectId],
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project not found' });
            return;
        }
        if (result.rows[0].api_key !== apiKey) {
            res.status(401).json({ success: false, error: 'Invalid API key for project' });
            return;
        }

        (req as any).agent = {
            project_id: projectId,
            api_key: apiKey,
        } satisfies AgentAuthContext;
        next();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, error: msg });
    }
}
