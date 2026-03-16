import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client | None = None

def get_db() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        )
    return _client

def log(
    site_id: str,
    job: str,
    action: str,
    status: str,
    payload: dict = None,
    response: dict = None,
    error: str = None,
    page_id: str = None,
) -> None:
    """Write an entry to execution_logs. Never raises — errors are printed."""
    try:
        get_db().table("execution_logs").insert({
            "site_id":       site_id,
            "page_id":       page_id,
            "job_name":      job,
            "action":        action,
            "status":        status,
            "payload":       payload,
            "response":      response,
            "error_message": error,
        }).execute()
    except Exception as e:
        print(f"[execution_log] Failed to write log: {e}")
