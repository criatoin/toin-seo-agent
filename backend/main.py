import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import sites, audit, pages, proposals, alerts, briefings, jobs, reports, settings, gsc

app = FastAPI(title="TOIN SEO Agent API", version="1.0.0")

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

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
