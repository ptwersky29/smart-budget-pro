# Penni data encryption key rotation

The backend now writes versioned `v2:` encrypted data with a stable salt independent of `JWT_SECRET` and `FRONTEND_URL`.

Before changing the JWT secret on a deployed backend:

1. In the backend host's private environment settings, set **ENCRYPTION_KEY** to a newly generated, random, at-least-32-character value and keep it unchanged across deployments. Do not commit or paste the value into GitHub, chat, or logs.
2. Keep the existing JWT secret configured while installing the stable data key. Existing unversioned ciphertext will still decrypt with the old legacy derivation.
3. If rotating JWT_SECRET, add the former JWT secret to **ENCRYPTION_PREVIOUS_KEYS** (comma-separated when there are multiple) until every old ciphertext has been migrated.
4. If a frontend URL used when old ciphertext was written is changing, keep that historical URL in **ENCRYPTION_LEGACY_FRONTEND_URLS** (comma-separated).
5. Verify previously connected providers can still decrypt existing credentials before retiring any legacy keys.

Use separate deployment secrets on the backend host. Do not generate a new ENCRYPTION_KEY on each deploy. Do not remove legacy secrets without verifying migration of old records.

New ciphertext is written as `v2:...`, and decrypt_value refuses to return a misleading blank result when no configured key matches. There is no automated migration of existing database rows in this change; keep legacy keys until separately migrated.

**Billing redirect allowlist:** set FRONTEND_URL to the real Penni frontend origin, for example `https://penni.leafaccounts.co.uk`. If there are other trusted frontend origins, add them to BILLING_ALLOWED_ORIGINS separated by commas. Arbitrary URL parameters are never accepted as checkout return destinations.
