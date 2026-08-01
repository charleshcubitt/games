import { env } from 'cloudflare:workers';

interface PaypalEnv {
	PAYPAL_CLIENT_ID: string;
	PAYPAL_CLIENT_SECRET: string;
	PAYPAL_ENV: string;
	PAYPAL_WEBHOOK_ID?: string;
}

function paypalEnv() {
	return env as unknown as PaypalEnv;
}

export function apiBase() {
	return paypalEnv().PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
	if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

	const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = paypalEnv();
	const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
	});
	if (!res.ok) throw new Error(`PayPal OAuth token request failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as { access_token: string; expires_in: number };

	cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
	return cachedToken.token;
}

/**
 * Verifies a webhook actually came from PayPal by posting it back to
 * PayPal's own verification endpoint, rather than reimplementing the
 * cryptographic (CRC32 + cert chain) check ourselves.
 */
export async function verifyWebhookSignature(headers: Headers, body: unknown): Promise<boolean> {
	const { PAYPAL_WEBHOOK_ID } = paypalEnv();
	if (!PAYPAL_WEBHOOK_ID) throw new Error('PAYPAL_WEBHOOK_ID is not configured');

	const token = await getAccessToken();
	const res = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			transmission_id: headers.get('paypal-transmission-id'),
			transmission_time: headers.get('paypal-transmission-time'),
			cert_url: headers.get('paypal-cert-url'),
			auth_algo: headers.get('paypal-auth-algo'),
			transmission_sig: headers.get('paypal-transmission-sig'),
			webhook_id: PAYPAL_WEBHOOK_ID,
			webhook_event: body,
		}),
	});
	if (!res.ok) return false;
	const data = (await res.json()) as { verification_status: string };
	return data.verification_status === 'SUCCESS';
}

export interface PaypalSubscription {
	id: string;
	status: 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
	custom_id?: string;
	billing_info?: {
		next_billing_time?: string;
		last_payment?: { amount: { value: string; currency_code: string }; time: string };
	};
}

/**
 * Webhook payloads carry billing details unreliably (e.g.
 * PAYMENT.SALE.COMPLETED has historically omitted billing_agreement_id
 * for some accounts) -- so webhooks are only ever used as a trigger to
 * re-fetch the authoritative subscription state from here, never as the
 * source of truth themselves.
 */
export async function getSubscription(id: string): Promise<PaypalSubscription> {
	const token = await getAccessToken();
	const res = await fetch(`${apiBase()}/v1/billing/subscriptions/${id}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) throw new Error(`PayPal get-subscription failed: ${res.status} ${await res.text()}`);
	return res.json();
}

// PayPal's status enum -> this project's lowercase convention (see the
// status column comment in db/migrations/0001_init.sql).
const STATUS_MAP: Record<PaypalSubscription['status'], string> = {
	APPROVAL_PENDING: 'pending',
	APPROVED: 'pending',
	ACTIVE: 'active',
	SUSPENDED: 'suspended',
	CANCELLED: 'canceled',
	EXPIRED: 'expired',
};

export function mapStatus(status: PaypalSubscription['status']): string {
	return STATUS_MAP[status] ?? 'pending';
}
