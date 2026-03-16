# Setup Bootstrap Directive

Initializes the complete infrastructure for the TOIN SEO Agent.

## Execution
```bash
python execution/setup_bootstrap.py
```

## Steps
1. Reads `.env` for all required API tokens
2. Creates GitHub repository `toin-seo-agent` (if GITHUB_TOKEN set and repo doesn't exist)
3. Creates Supabase project `toin-seo-agent` (if SUPABASE_ACCESS_TOKEN set and project doesn't exist)
4. Initializes database schema via migrations
5. Creates Coolify project `toin-seo-agent` (if COOLIFY_API_KEY set and project doesn't exist)
6. Generates `API_SECRET_KEY` and `CRON_SECRET` if not present
7. Updates `.env` with Supabase URL, service role key, and anon key
8. Creates initial scheduled tasks in Coolify

## Safety validations
- All resource names must be exactly `toin-seo-agent`
- Validates required environment variables before any creation
- Checks if resources already exist before creating
- Asks for user confirmation if resource exists

## Post-setup checklist
- [ ] `.env` file is complete with all tokens
- [ ] GitHub repo created and linked
- [ ] Supabase project created
- [ ] Database migrations applied
- [ ] Coolify project created with scheduled tasks
- [ ] All 5 scheduled tasks are running
- [ ] API health check passes: `curl http://localhost:8000/health`
- [ ] Frontend accessible: `http://localhost:3000`
