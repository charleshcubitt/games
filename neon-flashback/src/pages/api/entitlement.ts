import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../lib/serverAuth';
import { sql } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request);
	if (!user) {
		return Response.json({ active: false }, { status: 401 });
	}

	const db = sql();
	const rows = await db`select 1 from active_access where user_id = ${user.id} limit 1`;
	return Response.json({ active: rows.length > 0 });
};
