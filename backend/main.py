import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import sites, audit, pages, proposals, alerts, briefings, jobs, reports, settings, gsc, dashboard
from scheduler import create_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = create_scheduler()
    scheduler.start()
    logger.info("APScheduler started — %d jobs registered", len(scheduler.get_jobs()))
    for job in scheduler.get_jobs():
        logger.info("  job: %s  next: %s", job.id, job.next_run_time)
    yield
    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


app = FastAPI(title="TOIN SEO Agent API", version="1.0.0", lifespan=lifespan)

panel_url = os.getenv("PANEL_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[panel_url] if panel_url != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sites.router,     prefix="/api/sites",     tags=["sites"])
app.include_router(gsc.router,       prefix="/api/gsc",       tags=["gsc"])
app.include_router(audit.router,     prefix="/api/sites",     tags=["audit"])
app.include_router(pages.router,     prefix="/api/sites",     tags=["pages"])
app.include_router(proposals.router, prefix="/api/sites",     tags=["proposals"])
app.include_router(alerts.router,    prefix="/api/alerts",    tags=["alerts"])
app.include_router(briefings.router, prefix="/api/briefings", tags=["briefings"])
app.include_router(jobs.router,      prefix="/api/jobs",      tags=["jobs"])
app.include_router(reports.router,   prefix="/api/reports",   tags=["reports"])
app.include_router(settings.router,  prefix="/api/settings",  tags=["settings"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/scheduler/jobs")
def list_scheduled_jobs():
    """List all scheduled jobs and their next run times (admin use)."""
    from apscheduler.schedulers.background import BackgroundScheduler
    # Re-import via app state not available here; return static config instead
    return {
        "jobs": [
            {"id": "weekly_monitor",      "cron": "0 11 * * 1",   "description": "Weekly monitor + alerts"},
            {"id": "sync_gsc",            "cron": "0 12 * * 1",   "description": "Sync GSC data"},
            {"id": "apply_safe_routines", "cron": "0 14 * * 1",   "description": "Apply safe routines"},
            {"id": "generate_proposals",  "cron": "0 13 1 */3 *", "description": "Generate meta/schema proposals (quarterly)"},
            {"id": "monthly_briefing",    "cron": "0 11 1 * *",   "description": "Monthly content briefing"},
            {"id": "apply_approved",      "cron": "0 */2 * * *",  "description": "Apply approved changes (every 2h)"},
            {"id": "generate_report",     "cron": "0 13 1 * *",   "description": "Monthly KPI report"},
        ]
    }
