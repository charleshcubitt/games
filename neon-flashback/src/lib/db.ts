import { neon } from '@neondatabase/serverless';
import { env } from 'cloudflare:workers';
import { mapStatus, type PaypalSubscription } from './paypal';

export function sql() {
	return neon((env as { DATABASE_URL: string }).DATABASE_URL);
}

/**
 * Writes PayPal's authoritative subscription state into our own table.
 * Always fed from a fresh getSubscription() call (see paypal.ts) rather
 * than a webhook payload directly, so this is the single place that
 * translates "what PayPal says right now" into our schema.
 */
export async function upsertSubscription(userId: string, sub: PaypalSubscription) {
	const db = sql();
	await db`
		insert into subscriptions (user_id, provider, provider_subscription_id, status, current_period_end)
		values (${userId}, 'paypal', ${sub.id}, ${mapStatus(sub.status)}, ${sub.billing_info?.next_billing_time ?? null})
		on conflict (provider, provider_subscription_id)
		do update set
			status = excluded.status,
			current_period_end = excluded.current_period_end,
			updated_at = now()
	`;
}

/**
 * Update-only counterpart for the webhook path, which has no
 * authenticated user_id to insert with. If the row doesn't exist yet
 * (e.g. the webhook races ahead of the client's record-subscription
 * call), this is a harmless no-op -- record-subscription re-fetches
 * PayPal's current state directly and will land the same end result.
 * Returns whether a row was actually updated.
 */
export async function updateSubscriptionStatus(sub: PaypalSubscription): Promise<boolean> {
	const db = sql();
	const rows = await db`
		update subscriptions
		set status = ${mapStatus(sub.status)},
		    current_period_end = ${sub.billing_info?.next_billing_time ?? null},
		    updated_at = now()
		where provider = 'paypal' and provider_subscription_id = ${sub.id}
		returning user_id
	`;
	return rows.length > 0;
}
