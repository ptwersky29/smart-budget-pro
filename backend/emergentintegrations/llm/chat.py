class UserMessage:
    def __init__(self, text: str):
        self.text = text

class LlmChat:
    def __init__(self, api_key: str = None, session_id: str = None, system_message: str = None):
        pass
    def with_model(self, provider: str, model: str):
        return self
    async def send_message(self, message: UserMessage):
        return "This is a local dummy AI response since emergentintegrations is removed."
