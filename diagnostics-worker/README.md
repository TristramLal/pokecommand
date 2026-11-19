# PokéCommand automatic diagnostics — deployment required

This is a secure backend **template**, not a deployed service. GitHub Pages cannot receive private writes. Do not place GitHub tokens or Cloudflare secrets in index.html, bulk-import.js, or any public file.

1. Create a **private** GitHub repository for diagnostic reports, and grant a fine-grained GitHub token Contents: Read and write scoped only to that private repository.
2. Create a Cloudflare Worker and deploy `worker.js` using Wrangler.
3. Configure Worker variables `GITHUB_OWNER`, `GITHUB_REPO`, `ALLOWED_ORIGIN=https://tristramlal.github.io`. Add `GITHUB_TOKEN` and `TURNSTILE_SECRET` as encrypted Worker secrets. Add Turnstile widget site key to the frontend once available.
4. Confirm the Worker endpoint is reachable, then configure the PokéCommand client to send scrubbed logs after scans. The backend requires Turnstile verification. Automatic submission may require user interaction with the challenge.
5. Keep reports in the private repository; establish a retention/deletion schedule and monitor abuse and usage limits.

The Worker deliberately does **not** store raw video, frames, raw OCR text, filenames, nicknames, IP addresses, or other device identifiers. It stores error stages, frame timestamps, confidence scores, and detected species/CP. Never deploy the Worker with the public PokéCommand repository as its destination.

**Current status:** backend source prepared only; no Cloudflare account, private GitHub repository creation, Worker deployment, or secrets configuration has been performed. No automatic transmission is active.
