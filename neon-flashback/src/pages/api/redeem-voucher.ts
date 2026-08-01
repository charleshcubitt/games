import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../lib/serverAuth';
import { sql } from '../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request);
	if (!user) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const code = typeof body?.code === 'string' ? body.code.trim() : '';
	if (!code) {
		return Response.json({ error: 'Enter a voucher code.' }, { status: 400 });
	}

	const db = sql();

	// Single statement so the redemption-count increment and the
	// redemption record are atomic: if the INSERT hits the
	// unique(voucher_id, user_id) constraint (already redeemed by this
	// user), the whole statement -- including the UPDATE -- rolls back,
	// so a rejected redemption never silently consumes a limited slot.
	let rows;
	try {
		rows = await db`
			with v as (
				update vouchers
				set redeemed_count = redeemed_count + 1
				where code = ${code}
				  and redeemed_count < max_redemptions
				  and (expires_at is null or expires_at > now())
				returning id
			)
			insert into voucher_redemptions (voucher_id, user_id)
			select v.id, ${user.id} from v
			returning voucher_id
		`;
	} catch (err: any) {
		if (err?.code === '23505') {
			return Response.json({ error: 'You already redeemed this code.' }, { status: 409 });
		}
		throw err;
	}

	if (rows.length === 0) {
		return Response.json({ error: 'Invalid, expired, or fully redeemed code.' }, { status: 400 });
	}

	await db`insert into audit_log (user_id, event_type, detail) values (${user.id}, 'voucher.redeemed', ${JSON.stringify({ code })})`;

	return Response.json({ ok: true });
};
