# Weekly Monitor Directive

Monitors site SEO health and generates alerts for anomalies.

## Trigger
Automatic schedule: **Every Monday at 08h BRT** (11:00 UTC)
```
0 11 * * 1
```

Or manual:
```bash
POST /api/jobs/weekly-monitor
Body: {"site_id": "uuid"}
```

## Execution flow
1. `execution/weekly_monitor.py` → `run(site_id)`
2. Fetches current GSC metrics for the last 7 days
3. Compares against previous 7-day period
4. Analyzes per-page metrics:
   - **Traffic drop**: pages with 500+ impressions + 20%+ drop in clicks
   - **Deindexing**: pages in GSC last sync but now missing (Coverage report)
   - **Position improvement**: pages moving to positions 11-15 (optimization opportunity)
   - **Core Web Vitals regression**: pages moving from "Good" to "Needs Improvement" or "Poor"
5. Generates alerts only for real anomalies
6. Deduplicates: checks for existing unread alerts of same type before creating
7. If no anomalies: creates single informational alert "Tudo estável"

## Alert triggers

| Severity | Condition | Alert Type |
|----------|-----------|-----------|
| 🔴 Critical | Traffic drop > 20% on page with 500+ impressions | traffic_drop |
| 🔴 Critical | Page deindexed (in previous audit, missing now) | deindexed |
| 🔴 Critical | Core Web Vitals regressed to "Poor" | cwv_regression |
| 🟡 Warning | Position improved to 11-15 range | opportunity |
| 🟡 Warning | New query appearing with growing volume | emerging_query |
| 🟢 Info | Everything stable, no changes | stable_week |

## Deduplication
- Checks `alerts` table for unread (`read_at IS NULL`) alerts of same type for same page
- Only creates new alert if no similar unread alert exists
- Prevents alert spam for recurring issues

## Safety & Autonomy
- **Read-only monitoring**: only reads GSC and audit data
- **Generates alerts, never acts**: manager decides action via panel
- Updates `alerts.read_at` when manager reviews
- Never modifies site content or settings
