import { createRemoteJWKSet, jwtVerify } from 'jose';

const authBaseUrl = import.meta.env.PUBLIC_NEON_AUTH_URL as string;
const jwks = createRemoteJWKSet(new URL(`${authBaseUrl}/.well-known/jwks.json`));
// Tokens carry iss/aud as the bare origin (e.g. https://ep-xxx.neonauth...),
// not the full /<dbname>/auth path used for the JWKS/API base URL.
const authOrigin = new URL(authBaseUrl).origin;

export interface AuthedUser {
	id: string;
	email: string;
}

/**
 * Verifies the bearer JWT a page's client-side script attached (via
 * authClient.getJWTToken()) against Neon Auth's published JWKS. There's
 * no server-side session-cookie helper for Astro (createNeonAuth() only
 * ships for Next.js), so this is the framework-agnostic equivalent:
 * the token is signed by the auth server, so verifying it here doesn't
 * require trusting anything the client sends beyond the signature.
 */
export async function getUserFromRequest(request: Request): Promise<AuthedUser | null> {
	const header = request.headers.get('authorization');
	if (!header?.startsWith('Bearer ')) return null;
	const token = header.slice('Bearer '.length);

	try {
		const { payload } = await jwtVerify(token, jwks, {
			issuer: authOrigin,
			audience: authOrigin,
		});
		if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
		return { id: payload.sub, email: payload.email };
	} catch {
		return null;
	}
}
