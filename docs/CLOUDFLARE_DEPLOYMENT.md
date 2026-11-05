# Cloudflare deployment (optional, no Mac required)

The same inbox can run on Cloudflare Workers + one Durable Object instead of a Mac. Phones, the ChatGPT plugin, the dot task and every delivery rule (exact original, dedup, never resend, hold and verify when uncertain) stay the same. The Mac path in `INSTALL_FOR_DOT.md` remains the default and is unchanged.

Status: preview. Run by the author on one account; another user's independent Cloudflare deployment has not been verified.

## What runs where

- `cloud/worker.mjs` routes every request to one Durable Object (`InboxObject`), so all inbox, queue and ledger changes are serialized.
- Encrypted images, upload codes (hashes), OAuth clients/grants, subscriptions, the event queue and the delivery ledger live in that object's SQLite. Images expire after 1 hour, as on the Mac.
- `app.mjs` and `store_core.mjs` are the same code the Mac service uses. `cloud/split_ledger.mjs` is the delivery state machine ported from `split_delivery.py` with the same states.
- Images are checked structurally (`cloud/image_check.mjs`: PNG or JPEG, ≤8 MiB, ≤16 MP). Multi-picture (Ultra HDR / MPF) JPEGs are accepted by their primary image; the whole original file is delivered unchanged. Pixels are not decoded.
- The dot downloads originals from single-use, 2-minute links served by the Worker. No R2 bucket is needed.
- Events are signed (Standard Webhooks) and sent with `fetch` (no redirects, 10 s timeout); failed sends retry from Durable Object alarms. Workers cannot pin DNS like the Mac transport; Cloudflare does not route Worker subrequests to private networks.

## Cost

Durable Objects with SQLite are available on the Workers Free plan (100,000 requests/day, 5 GB stored). One person's phone sharing stays far below that. Nothing here enables a paid plan.

## One-click deploy (recommended)

1. Open `https://deploy.workers.cloudflare.com/?url=https://github.com/bryanzk/send-to-dot/tree/<TAG>` for the release you reviewed. Sign in to Cloudflare and GitHub/GitLab; Cloudflare copies the repository into your account and deploys the root `wrangler.toml` (Worker `send-to-dot-cloud`, one Durable Object, free plan). The project name also names the new Git repository, so it must not match a repository you already have.
2. When asked for `APPROVAL_SECRET`, choose your **owner code** (16+ characters). There is no address field: the address is bound on first `/setup`.
3. Open `https://<your-worker>.workers.dev/setup`, enter the owner code and save the phone code shown once. The first setup binds the inbox to that address. Without a `STORAGE_KEY` secret the encryption key is generated inside the Durable Object.
4. Continue with ChatGPT and phones (steps 5–6 below). Or let your dot guide all of this: README, “No Mac”.

## Manual deploy

Requirements: Node 25.6.1+, a Cloudflare account with a zone for your domain, `npm ci` in the checkout.

1. `npx wrangler@4.150.0 login`
2. Copy `cloud/wrangler.toml`, set `ORIGIN` to `https://<your-host>`, uncomment the route with your host and keep `custom_domain = true`. Add `workers_dev = false`.
3. Create secrets (never paste them into chat):
   ```sh
   node -e 'const c=require("crypto");console.log(JSON.stringify({STORAGE_KEY:c.randomBytes(32).toString("base64"),ADMIN_TOKEN:c.randomBytes(32).toString("base64url"),APPROVAL_SECRET:c.randomBytes(24).toString("base64url")}))' > /tmp/inbox-secrets.json
   npx wrangler@4.150.0 deploy --config cloud/wrangler.toml
   npx wrangler@4.150.0 secret bulk /tmp/inbox-secrets.json --config cloud/wrangler.toml
   ```
   Keep the JSON in a private, owner-only place, then delete the temporary copy. `APPROVAL_SECRET` is the owner code you type when connecting ChatGPT. Moving from a Mac instance, reuse its owner code instead.
4. Phone upload code: open `https://<your-host>/setup`, or `INBOX_ORIGIN=https://<your-host> ADMIN_TOKEN=… node cloud/admin.mjs issue-upload-code` (the owner code also works as `ADMIN_TOKEN`) prints a new upload-only code once and stores only its hash. Moving from a Mac instance, import the existing code's hash instead so phones keep their code.
5. In ChatGPT add a custom MCP server `https://<your-host>/mcp` (OAuth) and approve with the owner code. Then ask dot to create the `file.created` task (`docs/DOT_NATIVE_DELIVERY.md`, task outline).
6. Phones: open `https://<your-host>` on Android and connect with the upload code; in the iPhone Shortcut change the 收图地址 text to `https://<your-host>`.

## Operate

- `node cloud/admin.mjs status` — counts only.
- `node cloud/admin.mjs audit 30` — recent dispatch / claim / record events with timestamps and rejection reason codes (no tokens, links or captions), for latency checks.
- `node cloud/admin.mjs import-ledger attachment-map.json` — keeps an earlier delivery history deduplicated.
- Local run: `cd cloud && npx wrangler@4.150.0 dev --local-protocol https --var ORIGIN:https://localhost:8787 --var STORAGE_KEY:<base64> --var APPROVAL_SECRET:<code>`.

## Measured (author deployment, preview)

Generated test cards uploaded through the API, from upload to message accepted in the dot conversation: 43.1 s (6.5 KB), 50.9 s (1.1 MB), 56.4 s (2.3 MB, third in a burst). The same cards on the Mac + R2 path took 45.5, 60.0 and 72.3 s. Real phone photos measured from event dispatch to message accepted: 28.6 s, 31.6 s and 35.1 s. Dot wake-up (about 12–20 s) and dot tool calls remain the largest share; a 30 s tap-to-visible target is close but not guaranteed. Screen-recorded tap-to-visible timing on both phones for this release: not yet verified.
