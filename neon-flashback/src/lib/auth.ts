import { createAuthClient } from '@neondatabase/neon-js/auth';

export const authClient = createAuthClient(import.meta.env.PUBLIC_NEON_AUTH_URL);
