import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

def crawl_sitemap(site_url: str) -> list[str]:
    """Returns list of URLs from sitemap.xml"""
    sitemap_url = site_url.rstrip("/") + "/sitemap.xml"
    try:
        r = requests.get(sitemap_url, timeout=10)
        r.raise_for_status()
        root = ElementTree.fromstring(r.content)
        ns   = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        return [loc.text for loc in root.findall(".//sm:loc", ns)]
    except Exception as e:
        print(f"Sitemap error: {e}")
        return []

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
