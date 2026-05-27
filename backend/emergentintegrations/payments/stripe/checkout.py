import uuid


class CheckoutSessionRequest:
    def __init__(self, amount: float, currency: str, success_url: str, cancel_url: str, metadata: dict):
        self.amount = amount
        self.currency = currency
        self.success_url = success_url
        self.cancel_url = cancel_url
        self.metadata = metadata


class CheckoutSessionResponse:
    def __init__(self, url: str, session_id: str):
        self.url = url
        self.session_id = session_id


class CheckoutStatus:
    def __init__(self, status: str, payment_status: str, amount_total: float):
        self.status = status
        self.payment_status = payment_status
        self.amount_total = amount_total


class WebhookEvent:
    def __init__(self, session_id: str, payment_status: str, metadata: dict):
        self.session_id = session_id
        self.payment_status = payment_status
        self.metadata = metadata


class StripeCheckout:
    def __init__(self, api_key: str, webhook_url: str = ""):
        self.api_key = api_key
        self.webhook_url = webhook_url

    async def create_checkout_session(self, req: CheckoutSessionRequest) -> CheckoutSessionResponse:
        session_id = f"cs_{uuid.uuid4().hex}"
        return CheckoutSessionResponse(
            url=f"{req.success_url.replace('{CHECKOUT_SESSION_ID}', session_id)}&demo=true",
            session_id=session_id,
        )

    async def get_checkout_status(self, session_id: str) -> CheckoutStatus:
        return CheckoutStatus(status="complete", payment_status="paid", amount_total=5.00)

    async def handle_webhook(self, body: bytes, sig: str) -> WebhookEvent:
        import json
        try:
            data = json.loads(body)
        except Exception:
            data = {}
        return WebhookEvent(
            session_id=data.get("session_id", "unknown"),
            payment_status="paid",
            metadata=data.get("metadata", {}),
        )
