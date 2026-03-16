import pandas as pd
from pytrends.request import TrendReq


def get_trending_topics(
    keywords: list[str],
    geo: str = "BR",
    timeframe: str = "today 3-m",
) -> dict:
    """
    Fetch Google Trends interest and related queries for a list of keywords.
    Returns a dict with interest_over_time and related_queries.
    Handles up to 5 keywords (pytrends limitation).
    """
    if not keywords:
        return {"interest_over_time": {}, "related_queries": {}}

    kw_list = keywords[:5]  # pytrends max
    pt = TrendReq(hl="pt-BR", tz=180, timeout=(10, 25))
    pt.build_payload(kw_list, cat=0, timeframe=timeframe, geo=geo)

    try:
        interest = pt.interest_over_time()
        interest_dict = interest.drop(columns=["isPartial"], errors="ignore").to_dict() if not interest.empty else {}
    except Exception:
        interest_dict = {}

    try:
        related = pt.related_queries()
        related_dict = {}
        for kw, data in related.items():
            top_df = data.get("top")
            related_dict[kw] = top_df.to_dict(orient="records") if isinstance(top_df, pd.DataFrame) and not top_df.empty else []
    except Exception:
        related_dict = {}

    return {
        "interest_over_time": interest_dict,
        "related_queries":    related_dict,
    }
