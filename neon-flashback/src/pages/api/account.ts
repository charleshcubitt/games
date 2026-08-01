import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../lib/serverAuth';
import { sql } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request);
	if (!user) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	const db = sql();
	const [subscriptions, redemptions] = await Promise.all([
		db`select status, current_period_end, cancel_at_period_end
		   from subscriptions
		   where user_id = ${user.id}
		   order by created_at desc`,
		db`select v.code, vr.redeemed_at, v.grants_days
		   from voucher_redemptions vr
		   join vouchers v on v.id = vr.voucher_id
		   where vr.user_id = ${user.id}
		   order by vr.redeemed_at desc`,
	]);

	const active = await db`select 1 from active_access where user_id = ${user.id} limit 1`;

	return Response.json({
		email: user.email,
		active: active.length > 0,
		subscriptions,
		redemptions,
	});
};
