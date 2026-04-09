import { z } from 'zod';

export const RegisterSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const LoginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

export const UpdateRoleSchema = z.object({
    role: z.enum(['admin', 'user'], { message: 'role must be "admin" or "user"' }),
});
