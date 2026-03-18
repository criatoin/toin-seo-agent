import os, sys
from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from auth import require_cron_or_user

router = APIRouter()

# execution/ is copied into /app/execution/ by Dockerfile (built from repo root)
_exec_path = os.path.join(os.path.dirname(__file__), '..', 'execution')
if _exec_path not in sys.path:
    sys.path.insert(0, _exec_path)

class JobBody(BaseModel):
    site_id: str

def _run_job(module_name: str, site_id: str):
    import importlib
    mod = importlib.import_module(module_name)
    mod.run(site_id)

def _run_job_fn(module_name: str, fn_name: str, site_id: str):
    import importlib
    mod = importlib.import_module(module_name)
    getattr(mod, fn_name)(site_id)

# All job endpoints accept either cron secret OR valid user JWT
# so users can trigger them manually from the panel

@router.post("/technical-audit")
async def job_technical_audit(body: JobBody, bg: BackgroundTasks, auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job, "technical_audit", body.site_id)
    return {"queued": "technical-audit", "site_id": body.site_id}

@router.post("/sync-gsc")
async def job_sync_gsc(body: JobBody, bg: BackgroundTasks, auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job, "gsc_client", body.site_id)
    return {"queued": "sync-gsc", "site_id": body.site_id}

@router.post("/generate-proposals")
async def job_generate_proposals(body: JobBody, bg: BackgroundTasks, auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job, "meta_optimizer", body.site_id)
    return {"queued": "generate-proposals", "site_id": body.site_id}

@router.post("/weekly-monitor")
async def job_weekly_monitor(body: JobBody, bg: BackgroundTasks, auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job, "weekly_monitor", body.site_id)
    return {"queued": "weekly-monitor", "site_id": body.site_id}

@router.post("/monthly-briefing")
async def job_monthly_briefing(body: JobBody, bg: BackgroundTasks, auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job, "monthly_briefing", body.site_id)
    return {"queued": "monthly-briefing", "site_id": body.site_id}

@router.post("/apply-safe-routines")
async def job_apply_safe(body: JobBody, bg: BackgroundTasks, auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job_fn, "apply_changes_wp", "apply_safe_routines", body.site_id)
    return {"queued": "apply-safe-routines", "site_id": body.site_id}

@router.post("/apply-approved")
async def job_apply_approved(body: JobBody, bg: BackgroundTasks, auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job_fn, "apply_changes_wp", "apply_approved_meta", body.site_id)
    return {"queued": "apply-approved", "site_id": body.site_id}

@router.post("/generate-schemas")
async def job_generate_schemas(body: JobBody, bg: BackgroundTasks, _auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job_fn, "schema_optimizer", "generate_and_apply_all", body.site_id)
    return {"queued": "generate-schemas", "site_id": body.site_id}

@router.post("/bulk-fix-images-alt")
async def job_bulk_fix_images_alt(body: JobBody, bg: BackgroundTasks, _auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job_fn, "apply_changes_wp", "bulk_fix_images_alt", body.site_id)
    return {"queued": "bulk-fix-images-alt", "site_id": body.site_id}

@router.post("/generate-report")
async def job_generate_report(body: JobBody, bg: BackgroundTasks, auth=Depends(require_cron_or_user)):
    bg.add_task(_run_job, "generate_report", body.site_id)
    return {"queued": "generate-report", "site_id": body.site_id}
