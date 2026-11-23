# Penni MCP — ChatGPT connection

Status: implementation on a feature branch, not deployed or independently verified against a live service.

## Design
- Remote HTTPS MCP endpoint: https://YOUR-API-HOST/mcp
- OAuth consent page: https://YOUR-API-HOST/oauth/consent
- OAuth authorization-code flow with PKCE, resource binding, persistent database-backed tokens, refresh tokens and revocation.
- Uses an existing signed-in Penni session to approve ChatGPT, not a shared banking password.
- Read and write permissions are separate; write is unchecked by default on the consent screen.
- MCP tools use Penni's existing authenticated REST endpoints for ownership checks, balance adjustment and category learning.

## Available tools
Read: accounts, transactions with search/date/category/account filters, categories, budgets, recurring payments, merchant rules, split allocations and chart-ready spending reports.
Actions: record and edit transactions, suggest and approve categories, bulk categorisation, create/update budgets and categories, record a bookkeeping transfer and split a transaction.
Transfers are bookkeeping entries only, not actual bank payments.
The MCP does not expose delete/clear finance actions. Financial data and account credentials are never stored in the MCP layer; OAuth grants are in the existing Penni database.

## Deployment and ChatGPT connection
1. Test on a staging Render environment first with test financial records.
2. Set MCP_PUBLIC_BASE_URL to the HTTPS backend base URL, e.g. https://YOUR-API-HOST (no trailing slash). Preserve the existing DATABASE_URL, JWT_SECRET and FRONTEND_URL.
3. Run pip install -r backend/requirements.txt and python -m pytest backend/tests/test_penni_mcp.py -q.
4. Inspect OAuth authorization-server and protected-resource metadata, confirm GET/POST /mcp requires bearer auth, and test PKCE authorization, refresh, and revocation.
5. Verify a read-only connection cannot execute writes and that users cannot read or modify each other's data.
6. Test consent/login on the same API origin: an existing login cookie must be available to the backend host; cross-origin browser cookies may require special handling.
7. After independent security review, merge the PR and deploy the backend. Nothing needs a separate financial database.
8. In ChatGPT settings, use the available custom MCP connection interface (if supported by your plan), pointing to https://YOUR-API-HOST/mcp and complete the OAuth login and consent.

## Notes
- The first deployment creates an mcp_oauth_records database table.
- AI category suggestions may incur provider usage costs; review results.
- Visual charts are rendered in ChatGPT from the report data, rather than server-side image files.
- Account and ledger changes through a write tool take effect in the user's Penni records; confirm amounts and categories.
- Current ChatGPT product/plan limitations may restrict connecting custom MCP write actions.
## Verified Render layout (23 November 2026)

- Primary active API: `budget pro`, `srv-d8bhekm7r5hc73frdo20`, at `https://budget-pro-4jlg.onrender.com`. Root directory `backend`, tracked branch `master`, automatic deployment enabled. This is the intended future production MCP host, **not yet MCP-enabled**.
- Secondary old API: `financeai-api`, `srv-d8bha2jbc2fs73dob3l0`, at `https://financeai-api-k2w1.onrender.com`; recent Render deploys failed. Do not point the ChatGPT connection at this host.
- No independent staging service was present in the connected Render workspace at inspection. Create a dedicated staging service using `feat/penni-mcp-integration` and a separate test-only PostgreSQL database before a real OAuth connection test. Do not reuse the production database, secrets, bank integration credentials, or token issuers.
- Both existing Render API services track `master`. Merging the PR may cause deployments on both; inspect their automatic deploy policies before merging.
- `MCP_PUBLIC_BASE_URL` on staging must match the staging backend HTTPS URL exactly. On production it must match `https://budget-pro-4jlg.onrender.com`.
- The current backend is served by Render's Python runtime; confirm the deployed Python version against MCP 2.x compatibility, and test the parent/child Starlette lifespan integration on the same version.

## GitHub CI caveat (23 November 2026)

- PR backend tests and lint/type checks pass, including isolated HTTP OAuth metadata/consent tests.
- Concurrent changes on the `master` branch introduced invalid/unparseable characters in the frontend files `NotificationCenter.jsx`, `Connections.jsx`, and `IdlePolling.test.jsx`. PR merge-check CI can therefore fail frontend jobs independently of MCP changes; address this on the relevant frontend branch before merge.
- Isolated tests are not a replacement for real OAuth code exchange, refresh, and revocation tests using a deployed staging server. Nothing has been deployed for this MCP yet.

## ChatGPT account eligibility

- OpenAI's current custom MCP documentation offers full read/write custom MCP connections for Business and Enterprise/Edu accounts; Pro can use read/fetch only. It does not list Plus as eligible for arbitrary custom remote MCP connections. Check the user's actual available Plugins UI before promising an in-ChatGPT connection on Plus.
