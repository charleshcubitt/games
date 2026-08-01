import type { APIRoute } from 'astro';
import { getUserFromRequest } from '../../../lib/serverAuth';
import { getSubscription } from '../../../lib/paypal';
import { upsertSubscription } from '../../../lib/db';

export const prerender = false;

/**
 * Called by the client right after the PayPal Buttons onApprove
 * callback. This establishes the user_id <-> subscription_id link from
 * a source we trust (our own authenticated session), rather than from
 * anything PayPal's client-side JS hands back -- the actual status
 * written is always re-fetched from PayPal's API here, never taken from
 * the request body.
 */
export const POST: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request);
	if (!user) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const subscriptionId = typeof body?.subscriptionId === 'string' ? body.subscriptionId : '';
	if (!subscriptionId) {
		return Response.json({ error: 'Missing subscriptionId.' }, { status: 400 });
	}

	const sub = await getSubscription(subscriptionId);
	await upsertSubscription(user.id, sub);

	return Response.json({ status: sub.status });
};
