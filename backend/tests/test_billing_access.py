from billing import _payment_confirmed, _subscription_grants_premium


def test_only_paid_or_trial_checkout_grants_access():
    assert _payment_confirmed("paid") is True
    assert _payment_confirmed("no_payment_required") is True
    assert _payment_confirmed("unpaid") is False
    assert _payment_confirmed(None) is False


def test_only_active_or_trialing_subscription_grants_premium():
    assert _subscription_grants_premium("active") is True
    assert _subscription_grants_premium("trialing") is True
    assert _subscription_grants_premium("ACTIVE") is True
    assert _subscription_grants_premium("past_due") is False
    assert _subscription_grants_premium("incomplete") is False
    assert _subscription_grants_premium("canceled") is False
    assert _subscription_grants_premium(None) is False
