import os
import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


def _score_label(value: float | None) -> str:
    if value is None:
        return "unknown"
    if value >= 0.9:
        return "good"
    if value >= 0.5:
        return "needs_improvement"
    return "poor"


def analyze(url: str, strategy: str = "mobile") -> dict:
    """
    Run PageSpeed Insights for a URL.
    Returns a dict with LCP, CLS, INP scores and raw values.
    Works without an API key (rate-limited to 25k/day free tier).
    """
    params: dict = {
        "url":      url,
        "strategy": strategy,
        "category": ["performance"],
    }
    key = os.getenv("PAGESPEED_API_KEY")
    if key:
        params["key"] = key

    r = requests.get(BASE_URL, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()

    audits = data.get("lighthouseResult", {}).get("audits", {})

    lcp_ms = audits.get("largest-contentful-paint", {}).get("numericValue", 0)
    cls    = audits.get("cumulative-layout-shift",  {}).get("numericValue", 0)
    inp_ms = audits.get("interaction-to-next-paint",{}).get("numericValue", 0)

    def lcp_score(ms):
        if ms < 2500:  return 1.0
        if ms < 4000:  return 0.6
        return 0.0

    def cls_score(v):
        if v < 0.1:  return 1.0
        if v < 0.25: return 0.6
        return 0.0

    def inp_score(ms):
        if ms < 200:  return 1.0
        if ms < 500:  return 0.6
        return 0.0

    perf = data.get("lighthouseResult", {}).get("categories", {}).get("performance", {}).get("score", 0)

    return {
        "strategy":   strategy,
        "lcp_ms":     lcp_ms,
        "lcp_score":  _score_label(lcp_score(lcp_ms)),
        "cls":        cls,
        "cls_score":  _score_label(cls_score(cls)),
        "inp_ms":     inp_ms,
        "inp_score":  _score_label(inp_score(inp_ms)),
        "perf_score": perf,
    }
