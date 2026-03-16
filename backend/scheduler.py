"""
APScheduler cron runner — embedded in the FastAPI process.
Replaces Coolify Scheduled Tasks (API not available in beta.460).

Schedule mirrors the CLAUDE.md spec (all times UTC):
  weekly-monitor      0 11 * * 1   (Mon 08h BRT)
  sync-gsc            0 12 * * 1   (Mon 09h BRT)
  apply-safe-routines 0 14 * * 1   (Mon 11h BRT)
  generate-proposals  0 13 1 */3 * (1st of month, quarterly)
  monthly-briefing    0 11 1 * *   (1st of month 08h BRT)
  apply-approved      0 */2 * * *  (every 2h)
  generate-report     0 13 1 * *   (1st of month 10h BRT)
"""
import os, sys, logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("scheduler")

# Execution scripts directory
# execution/ lives at backend/execution/ in the repo -> /app/execution/ in the container
_exec_path = os.path.join(os.path.dirname(__file__), 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)


def _get_all_site_ids() -> list[str]:
    """Return all active site IDs from Supabase."""
    try:
        from database import get_db
        db = get_db()
        res = db.table("sites").select("id").eq("active", True).execute()
        return [r["id"] for r in (res.data or [])]
    except Exception as e:
        logger.error("scheduler: failed to fetch sites: %s", e)
        return []


def _run_for_all_sites(module_name: str, fn_name: str = "run"):
    site_ids = _get_all_site_ids()
    if not site_ids:
        logger.info("scheduler: no active sites found for %s", module_name)
        return
    import importlib
    try:
        mod = importlib.import_module(module_name)
    except ImportError as e:
        logger.error("scheduler: cannot import %s: %s", module_name, e)
        return
    for site_id in site_ids:
        try:
            logger.info("scheduler: running %s.%s for site %s", module_name, fn_name, site_id)
            getattr(mod, fn_name)(site_id)
        except Exception as e:
            logger.error("scheduler: %s.%s failed for %s: %s", module_name, fn_name, site_id, e)


def _run_apply_safe():
    site_ids = _get_all_site_ids()
    import importlib
    try:
        mod = importlib.import_module("apply_changes_wp")
    except ImportError as e:
        logger.error("scheduler: cannot import apply_changes_wp: %s", e)
        return
    for site_id in site_ids:
        try:
            mod.apply_safe_routines(site_id)
        except Exception as e:
            logger.error("scheduler: apply_safe_routines failed for %s: %s", site_id, e)


def _run_apply_approved():
    site_ids = _get_all_site_ids()
    import importlib
    try:
        mod = importlib.import_module("apply_changes_wp")
    except ImportError as e:
        logger.error("scheduler: cannot import apply_changes_wp: %s", e)
        return
    for site_id in site_ids:
        try:
            mod.apply_approved_meta(site_id)
        except Exception as e:
            logger.error("scheduler: apply_approved_meta failed for %s: %s", site_id, e)


def create_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")

    # Mon 11:00 UTC — weekly monitor + alerts
    scheduler.add_job(
        lambda: _run_for_all_sites("weekly_monitor"),
        CronTrigger(day_of_week="mon", hour=11, minute=0),
        id="weekly_monitor", replace_existing=True,
    )

    # Mon 12:00 UTC — sync GSC data
    scheduler.add_job(
        lambda: _run_for_all_sites("gsc_client"),
        CronTrigger(day_of_week="mon", hour=12, minute=0),
        id="sync_gsc", replace_existing=True,
    )

    # Mon 14:00 UTC — apply safe routines (auto-fill empty meta, fix canonicals)
    scheduler.add_job(
        _run_apply_safe,
        CronTrigger(day_of_week="mon", hour=14, minute=0),
        id="apply_safe_routines", replace_existing=True,
    )

    # 1st of month, every 3 months, 13:00 UTC — generate meta/schema proposals
    scheduler.add_job(
        lambda: _run_for_all_sites("meta_optimizer"),
        CronTrigger(day=1, month="*/3", hour=13, minute=0),
        id="generate_proposals", replace_existing=True,
    )

    # 1st of each month, 11:00 UTC — monthly content briefing
    scheduler.add_job(
        lambda: _run_for_all_sites("monthly_briefing"),
        CronTrigger(day=1, hour=11, minute=0),
        id="monthly_briefing", replace_existing=True,
    )

    # Every 2h — apply approved meta/schema changes
    scheduler.add_job(
        _run_apply_approved,
        CronTrigger(minute=0, hour="*/2"),
        id="apply_approved", replace_existing=True,
    )

    # 1st of each month, 13:00 UTC — monthly KPI report
    scheduler.add_job(
        lambda: _run_for_all_sites("generate_report"),
        CronTrigger(day=1, hour=13, minute=0),
        id="generate_report", replace_existing=True,
    )

    return scheduler
