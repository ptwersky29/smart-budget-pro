class FinanceAIError(Exception):
    """Base class for exceptions in this application."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class NotFoundError(FinanceAIError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=404)


class ValidationError(FinanceAIError):
    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status_code=400)


class AuthenticationError(FinanceAIError):
    def __init__(self, message: str = "Authentication required"):
        super().__init__(message, status_code=401)


class ForbiddenError(FinanceAIError):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(message, status_code=403)


class ConflictError(FinanceAIError):
    def __init__(self, message: str = "Conflict"):
        super().__init__(message, status_code=409)


class RateLimitError(FinanceAIError):
    def __init__(self, message: str = "Too many requests"):
        super().__init__(message, status_code=429)
