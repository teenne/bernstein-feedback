import { z } from 'zod';

// user_id is intentionally absent — routes derive it from the JWT
// (requireAuth middleware). Accepting user_id from the client would let any
// caller read anyone's notifications by passing their UUID.
export const GetNotificationsSchema = z.object({
    project_id: z.string().min(1, 'project_id is required'),
});

export const MarkAllReadSchema = z.object({
    project_id: z.string().min(1, 'project_id is required'),
});

