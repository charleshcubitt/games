import type { APIRoute } from 'astro';
import { verifyWebhookSignature, getSubscription } from '../../../lib/paypal';
import { updateSubscriptionStatus, sql } from '../../../lib/db';

export const prerender = false;

const SUBSCRIPTION_EVENTS = new Set([
	'BILLING.SUBSCRIPTION.ACTIVATED',
	'BILLING.SUBSCRIPTION.UPDATED',
	'BILLING.SUBSCRIPTION.CANCELLED',
	'BILLING.SUBSCRIPTION.SUSPENDED',
	'BILLING.SUBSCRIPTION.EXPIRED',
]);

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body) return new Response('bad request', { status: 400 });

	const verified = await verifyWebhookSignature(request.headers, body);
	if (!verified) return new Response('invalid signature', { status: 400 });

	const eventType: string = body.event_type;
	const resource = body.resource ?? {};

	// Webhook payload fields aren't trusted for billing details (see
	// paypal.ts) -- the event only tells us *which* subscription to
	// re-fetch from PayPal's API, which is what actually gets written.
	let subscriptionId: string | undefined;
	if (SUBSCRIPTION_EVENTS.has(eventType)) {
		subscriptionId = resource.id;
	} else if (eventType === 'PAYMENT.SALE.COMPLETED') {
		subscriptionId = resource.billing_agreement_id;
	}

	if (!subscriptionId) {
		// Not an event we act on (or PAYMENT.SALE.COMPLETED without a
		// billing_agreement_id -- a known PayPal gap, see paypal.ts).
		// Acknowledge anyway so PayPal doesn't keep retrying it.
		return new Response('ok', { status: 200 });
	}

	const sub = await getSubscription(subscriptionId);
	const updated = await updateSubscriptionStatus(sub);

	if (updated) {
		const db = sql();
		await db`
			insert into audit_log (event_type, detail)
			values (${'paypal.' + eventType.toLowerCase()}, ${JSON.stringify({ subscriptionId, status: sub.status })})
		`;
	}

	return new Response('ok', { status: 200 });
};
