import os
import requests
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

def complete(
    prompt: str,
    system: str = "You are an expert SEO strategist. Always respond in the same language as the content you are analyzing.",
    max_tokens: int = 2048,
) -> str:
    """
    Send a prompt to DeepSeek V3.2 via OpenRouter and return the response text.
    Raises requests.HTTPError on API failure.
    """
    r = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
            "Content-Type":  "application/json",
        },
        json={
            "model": os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-chat-v3-2"),
            "messages": [
                {"role": "system", "content": system},
                {"role": "user",   "content": prompt},
            ],
            "max_tokens": max_tokens,
        },
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]
