import pytest

from bank_sync_utils import is_reauth_error


@pytest.mark.parametrize("message", [
    "Refresh failed: 500 temporarily unavailable",
    "Refresh failed: 429 rate limited",
    "Refresh failed: 503 gateway timeout",
    "TrueLayer API error /balance: 500",
    "temporary bank API outage",
])
def test_transient_refresh_errors_do_not_require_reconsent(message):
    assert not is_reauth_error(RuntimeError(message))


@pytest.mark.parametrize("message", [
    "Token expired and no refresh token available — reconnect your bank",
    'Refresh failed: 400 {"error":"invalid_grant"}',
    "HTTP 401 Unauthorized",
    "refresh token revoked",
])
def test_real_auth_failures_request_reconsent(message):
    assert is_reauth_error(RuntimeError(message))
