# Skill: toin.seo.weekly-monitor

Monitors site health and generates alerts for anomalies.

## Entry point
```bash
python execution/weekly_monitor.py --site-id <uuid>
```

Or via API:
```bash
POST /api/jobs/weekly-monitor
Content-Type: application/json
X-Cron-Secret: ${CRON_SECRET}

{"site_id": "uuid"}
```

## Schedule
Automatic: **Every Monday at 08h BRT** (11:00 UTC)

Cron: `0 11 * * 1`

## What it monitors
Compares current week (last 7 days) vs previous week:

**Traffic drops** (🔴 Critical)
- Pages with 500+ impressions and 20%+ drop in clicks
- Indicates loss of visibility or CTR

**Deindexing** (🔴 Critical)
- Pages indexed in previous audit, now missing from GSC
- Major indexation issue

**Core Web Vitals regression** (🔴 Critical)
- Pages moving from "Good" to "Needs Improvement" or "Poor"
- Performance drop detected

**Ranking improvements** (🟡 Opportunity)
- Pages moving to positions 11-15 (close to top 10)
- Potential for organic link building or content boost

**Emerging queries** (🟡 Opportunity)
- New queries with 30%+ growth in volume
- Content gap or trend signal

**Stable state** (🟢 Info)
- No anomalies detected
- Everything on track

## Alert structure
```json
{
  "site_id": "uuid",
  "page_id": "uuid",
  "severity": "critical",
  "alert_type": "traffic_drop",
  "title": "Page /services/seo lost 31% traffic",
  "description": "Impressions stable (450) but clicks dropped from 18 to 12",
  "data": {
    "page_url": "/services/seo",
    "previous_clicks": 18,
    "current_clicks": 12,
    "drop_percentage": 33.3
  }
}
```

## Deduplication
- Checks for existing unread (`read_at IS NULL`) alerts of same type for same page
- Only creates new alert if no similar unread alert exists
- Prevents alert spam for recurring issues

## Safety
- Read-only monitoring
- No automatic actions
- Manager reviews and decides action via panel
- Never modifies site content or settings
