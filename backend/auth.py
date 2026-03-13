import os
from fastapi import HTTPException, Security, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

bearer_scheme = HTTPBearer(auto_error=False)

async def require_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header required")
    from database import get_db
    db = get_db()
    try:
        user = db.auth.get_user(credentials.credentials)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

async def require_cron(x_cron_secret: str = Header(None)) -> bool:
    expected = os.environ.get("CRON_SECRET", "")
    if not x_cron_secret or x_cron_secret != expected:
        raise HTTPException(status_code=401, detail="Invalid cron secret")
    return True

async def require_cron_or_user(
    x_cron_secret: str = Header(None),
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> bool:
    """Accepts either cron secret OR valid user JWT — used for technical-audit triggered from panel."""
    cron_ok = bool(x_cron_secret and x_cron_secret == os.environ.get("CRON_SECRET", ""))
    if cron_ok:
        return True
    if credentials:
        from database import get_db
        db = get_db()
        try:
            db.auth.get_user(credentials.credentials)
            return True
        except Exception:
            pass
    raise HTTPException(status_code=401, detail="Authentication required")
