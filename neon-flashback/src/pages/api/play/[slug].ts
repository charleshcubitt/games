import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/serverAuth';
import { sql } from '../../../lib/db';

export const prerender = false;

/**
 * Proxies a game's current build from wherever it's actually hosted
 * (GitHub Pages for now -- see source_url), gated by entitlement. The
 * game bytes never reach the browser at all unless this check passes,
 * unlike the old direct GitHub Pages links, which anyone could reach
 * regardless of login/payment status.
 */
export const GET: APIRoute = async ({ params, request }) => {
	const slug = params.slug;
	const db = sql();
	const rows = await db`select source_url, has_demo from games where slug = ${slug} and active = true limit 1`;
	if (rows.length === 0) {
		return new Response('Not found', { status: 404 });
	}
	const game = rows[0] as { source_url: string; has_demo: boolean };

	const user = await getUserFromRequest(request);
	let hasAccess = false;
	if (user) {
		const active = await db`select 1 from active_access where user_id = ${user.id} limit 1`;
		hasAccess = active.length > 0;
	}

	if (!hasAccess && !game.has_demo) {
		return Response.json(
			{ error: user ? 'subscription_required' : 'login_required' },
			{ status: user ? 403 : 401 },
		);
	}

	const upstream = await fetch(game.source_url);
	if (!upstream.ok) {
		return new Response('Upstream game build unavailable', { status: 502 });
	}

	return new Response(upstream.body, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
};
