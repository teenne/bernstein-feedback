import { z } from 'zod';

// user_id is intentionally absent — routes derive it from the JWT
// (requireAuth middleware). Accepting user_id from the client would let any
// caller read anyone's notifications by passing their UUID.
//
// project_id is optional: when omitted (admin bell / cross-project scope),
// the route returns every notification the authenticated user can see,
// scoped by user_id + project membership + global admin.
export const GetNotificationsSchema = z.object({
    project_id: z.string().min(1).optional(),
});

export const MarkAllReadSchema = z.object({
    project_id: z.string().min(1).optional(),
});
