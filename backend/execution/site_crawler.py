import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

def _fetch_sitemap_urls(sitemap_url: str, depth: int = 0) -> list[str]:
    """Fetch URLs from a single sitemap URL (handles both index and urlset)."""
    if depth > 3:
        return []
    try:
        r = requests.get(sitemap_url, timeout=10, headers={"User-Agent": "TOINSEOBot/1.0"})
        r.raise_for_status()
        root = ElementTree.fromstring(r.content)
        ns   = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        # Sitemap index: contains <sitemap><loc>...</loc></sitemap> entries
        child_sitemaps = root.findall("sm:sitemap/sm:loc", ns)
        if child_sitemaps:
            urls = []
            for loc in child_sitemaps:
                child_url = loc.text.strip() if loc.text else ""
                if child_url:
                    urls.extend(_fetch_sitemap_urls(child_url, depth + 1))
            return urls

        # Regular sitemap: contains <url><loc>...</loc></url> entries
        return [
            loc.text.strip()
            for loc in root.findall("sm:url/sm:loc", ns)
            if loc.text and not loc.text.strip().endswith(".xml")
        ]
    except Exception as e:
        print(f"Sitemap error ({sitemap_url}): {e}")
        return []


def crawl_sitemap(site_url: str) -> list[str]:
    """Returns list of actual page URLs from sitemap.xml (handles sitemap indexes)."""
    sitemap_url = site_url.rstrip("/") + "/sitemap.xml"
    urls = _fetch_sitemap_urls(sitemap_url)
    # Deduplicate while preserving order
    seen = set()
    result = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            result.append(u)
    return result

def crawl_page(url: str) -> dict:
    """Crawl a single page and return SEO-relevant data."""
    try:
        r   = requests.get(url, timeout=10, headers={"User-Agent": "TOINSEOBot/1.0"})
        soup = BeautifulSoup(r.text, "html.parser")

        title    = soup.find("title")
        desc_tag = soup.find("meta", attrs={"name": "description"})
        h1s      = soup.find_all("h1")
        canonical = soup.find("link", attrs={"rel": "canonical"})
        images   = soup.find_all("img")
        links    = [a.get("href") for a in soup.find_all("a", href=True)]

        return {
            "url":           url,
            "status_code":   r.status_code,
            "title":         title.get_text(strip=True) if title else "",
            "meta_desc":     desc_tag.get("content", "") if desc_tag else "",
            "h1s":           [h.get_text(strip=True) for h in h1s],
            "canonical":     canonical.get("href") if canonical else "",
            "images_total":  len(images),
            "images_no_alt": sum(1 for img in images if not img.get("alt")),
            "internal_links": [l for l in links if urlparse(l).netloc in ("", urlparse(url).netloc)],
            "external_links": [l for l in links if urlparse(l).netloc not in ("", urlparse(url).netloc)],
        }
    except Exception as e:
        return {"url": url, "error": str(e)}
