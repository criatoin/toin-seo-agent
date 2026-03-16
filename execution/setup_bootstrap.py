#!/usr/bin/env python3
"""
Bootstrap script -- creates GitHub repo, Supabase project, Coolify project.
Run once. Safe to re-run (checks before creating).
"""
import os, secrets, string, json, requests
from dotenv import load_dotenv, set_key

load_dotenv()
ENV_FILE = ".env"

def generate_secret(length=32):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_secrets():
    if not os.getenv("API_SECRET_KEY"):
        secret = generate_secret(64)
        set_key(ENV_FILE, "API_SECRET_KEY", secret)
        print("[OK] API_SECRET_KEY generated")
    else:
        print("[OK] API_SECRET_KEY already set")
    if not os.getenv("CRON_SECRET"):
        secret = generate_secret(32)
        set_key(ENV_FILE, "CRON_SECRET", secret)
        print("[OK] CRON_SECRET generated")
    else:
        print("[OK] CRON_SECRET already set")

def create_github_repo():
    token = os.getenv("GITHUB_TOKEN")
    username = os.getenv("GITHUB_USERNAME")
    if not token or not username:
        print("[SKIP] GITHUB_TOKEN or GITHUB_USERNAME missing -- skipping GitHub setup")
        return None
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    r = requests.get(f"https://api.github.com/repos/{username}/toin-seo-agent", headers=headers)
    if r.status_code == 200:
        print(f"[OK] GitHub repo already exists: {r.json()['html_url']}")
        return r.json()["html_url"]
    r = requests.post("https://api.github.com/user/repos", headers=headers, json={
        "name": "toin-seo-agent",
        "description": "TOIN SEO Agent -- sistema de SEO tecnico e estrategico",
        "private": True,
        "auto_init": True
    })
    r.raise_for_status()
    url = r.json()["html_url"]
    print(f"[OK] GitHub repo created: {url}")
    return url

def create_supabase_project():
    token = os.getenv("SUPABASE_ACCESS_TOKEN")
    org_id = os.getenv("SUPABASE_ORG_ID")
    if not token or not org_id:
        print("[SKIP] SUPABASE_ACCESS_TOKEN or SUPABASE_ORG_ID missing -- skipping Supabase setup")
        return None
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    r = requests.get("https://api.supabase.com/v1/projects", headers=headers)
    r.raise_for_status()
    projects = r.json()
    existing = next((p for p in projects if p["name"] == "toin-seo-agent"), None)
    if existing:
        print(f"[WARN] Supabase project 'toin-seo-agent' already exists. Use it? (y/n): ", end="")
        if input().strip().lower() != "y":
            raise SystemExit("Aborted -- not touching existing project.")
        project_id = existing["id"]
    else:
        db_pass = generate_secret(20)
        r = requests.post("https://api.supabase.com/v1/projects", headers=headers, json={
            "name": "toin-seo-agent",
            "organization_id": org_id,
            "plan": "free",
            "region": "sa-east-1",
            "db_pass": db_pass
        })
        r.raise_for_status()
        project_id = r.json()["id"]
        print(f"[OK] Supabase project created: {project_id}")
        print(f"     DB password (save this): {db_pass}")
        import time
        print("     Waiting 30s for project to initialize...")
        time.sleep(30)

    supabase_url = f"https://{project_id}.supabase.co"
    set_key(ENV_FILE, "SUPABASE_URL", supabase_url)
    set_key(ENV_FILE, "SUPABASE_PROJECT_ID", project_id)

    r = requests.get(f"https://api.supabase.com/v1/projects/{project_id}/api-keys", headers=headers)
    r.raise_for_status()
    keys = {k["name"]: k["api_key"] for k in r.json()}
    set_key(ENV_FILE, "SUPABASE_ANON_KEY", keys.get("anon", ""))
    set_key(ENV_FILE, "SUPABASE_SERVICE_ROLE_KEY", keys.get("service_role", ""))
    print(f"[OK] Supabase keys saved to .env")
    return project_id

def create_coolify_project():
    base = os.getenv("COOLIFY_BASE_URL", "").rstrip("/")
    key = os.getenv("COOLIFY_API_KEY")
    if not base or not key:
        print("[SKIP] Coolify credentials missing -- skipping")
        return
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    r = requests.get(f"{base}/api/v1/projects", headers=headers)
    r.raise_for_status()
    projects = r.json()
    existing = next((p for p in projects if p.get("name") == "toin-seo-agent"), None)
    if existing:
        print(f"[OK] Coolify project 'toin-seo-agent' already exists (id={existing['id']}). Skipping creation.")
        return existing["id"]
    r = requests.post(f"{base}/api/v1/projects", headers=headers, json={
        "name": "toin-seo-agent",
        "description": "TOIN SEO Agent -- backend + frontend"
    })
    r.raise_for_status()
    project_id = r.json()["id"]
    print(f"[OK] Coolify project created: {project_id}")
    return project_id

if __name__ == "__main__":
    print("\nTOIN SEO Agent -- Bootstrap\n")
    generate_secrets()
    create_github_repo()
    create_supabase_project()
    create_coolify_project()
    print("\n[DONE] Bootstrap completo. Rode as migrations SQL no Supabase antes de continuar.\n")
    print("Pending manual configuration:")
    print("  NEXT_PUBLIC_API_URL = URL do backend apos deploy no Coolify")
    print("  PANEL_URL           = URL do frontend apos deploy no Coolify")
    print("  GSC_CLIENT_ID       = Google Cloud Console -> OAuth 2.0 credentials")
    print("  GSC_CLIENT_SECRET   = Google Cloud Console -> OAuth 2.0 credentials")
