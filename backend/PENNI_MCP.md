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