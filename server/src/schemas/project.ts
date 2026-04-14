import { z } from 'zod';

export const CreateProjectSchema = z.object({
    id: z.string().min(1, 'Project ID is required'),
    name: z.string().optional(),
    owner_id: z.string().optional(),
    owner_email: z.string().email().optional().or(z.literal('')).or(z.literal(null)),
});

export const UpdateProjectSchema = z.object({
    name: z.string().optional(),
    plan: z.string().optional(),
    plan_id: z.string().optional(),
    config: z.record(z.unknown()).optional(),
    plan_limits: z.record(z.unknown()).optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: 'No fields to update',
});

export const AddMemberSchema = z.object({
    user_id: z.string().optional(),
    email: z.string().email('Valid email is required'),
    role: z.enum(['owner', 'member', 'viewer']).default('member'),
});
