import { z } from 'zod';

export const GetNotificationsSchema = z.object({
    project_id: z.string().min(1, 'project_id is required'),
    user_id: z.string().min(1, 'user_id is required'),
});

export const MarkAllReadSchema = z.object({
    project_id: z.string().min(1, 'project_id is required'),
    user_id: z.string().min(1, 'user_id is required'),
});

