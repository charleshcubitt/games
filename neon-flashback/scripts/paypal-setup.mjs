// One-time setup: creates the PayPal Product + Subscription Plan for the
// all-access pass. Run once per environment (sandbox, then again for live
// when going live -- sandbox and live are entirely separate PayPal apps
// with their own Product/Plan IDs).
//
//   node --env-file=.dev.vars scripts/paypal-setup.mjs
//
// Prints the resulting PAYPAL_PLAN_ID to add to .dev.vars (and later,
// wrangler secret put for deployed environments).

const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV } = process.env;
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
	console.error('Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in environment.');
	process.exit(1);
}

const MONTHLY_PRICE_USD = '2.99';

const base = PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function getAccessToken() {
	const res = await fetch(`${base}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
	});
	if (!res.ok) throw new Error(`OAuth token request failed: ${res.status} ${await res.text()}`);
	const data = await res.json();
	return data.access_token;
}

async function main() {
	const token = await getAccessToken();
	const authHeaders = {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
	};

	console.log(`Creating product (${PAYPAL_ENV ?? 'sandbox'})...`);
	const productRes = await fetch(`${base}/v1/catalogs/products`, {
		method: 'POST',
		headers: authHeaders,
		body: JSON.stringify({
			name: 'Retro Games All-Access',
			description: 'All-access pass to the retro games portal.',
			type: 'SERVICE',
			category: 'SOFTWARE',
		}),
	});
	if (!productRes.ok) throw new Error(`Create product failed: ${productRes.status} ${await productRes.text()}`);
	const product = await productRes.json();
	console.log('Product ID:', product.id);

	console.log('Creating monthly subscription plan...');
	const planRes = await fetch(`${base}/v1/billing/plans`, {
		method: 'POST',
		headers: authHeaders,
		body: JSON.stringify({
			product_id: product.id,
			name: 'All-Access Monthly',
			description: `Monthly all-access pass, $${MONTHLY_PRICE_USD}/month.`,
			billing_cycles: [
				{
					frequency: { interval_unit: 'MONTH', interval_count: 1 },
					tenure_type: 'REGULAR',
					sequence: 1,
					total_cycles: 0, // 0 = renews indefinitely until cancelled
					pricing_scheme: {
						fixed_price: { value: MONTHLY_PRICE_USD, currency_code: 'USD' },
					},
				},
			],
			payment_preferences: {
				auto_bill_outstanding: true,
				payment_failure_threshold: 3,
			},
		}),
	});
	if (!planRes.ok) throw new Error(`Create plan failed: ${planRes.status} ${await planRes.text()}`);
	const plan = await planRes.json();

	console.log('\nPlan ID:', plan.id);
	console.log('\nAdd this to .dev.vars:');
	console.log(`PAYPAL_PLAN_ID=${plan.id}`);
	console.log('PUBLIC_PAYPAL_PLAN_ID=' + plan.id, '(add to .env -- the client-side Subscribe button needs it too)');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
