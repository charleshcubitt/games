// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Most pages here check auth/entitlement per request (is this user
  // logged in, do they have an active subscription) rather than being
  // static, so this runs as a Cloudflare Worker on every request instead
  // of prerendering to static HTML at build time.
  output: 'server',
  adapter: cloudflare(),
  vite: {
    server: {
      // Lets a `cloudflared tunnel` URL reach the dev server for
      // testing PayPal webhooks locally (Vite blocks unrecognized
      // Host headers by default). Dev-only, harmless to leave in.
      allowedHosts: ['.trycloudflare.com'],
    },
  },
});