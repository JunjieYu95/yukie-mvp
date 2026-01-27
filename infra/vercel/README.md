# Vercel setup (CLI only)

All steps use the Vercel CLI. Ensure you’re logged in and linked: `vercel link` then `vercel whoami`.

## One-shot setup

From repo root:

```bash
./scripts/vercel-env-setup.sh
```

Optionally set secrets first:

```bash
export JWT_SECRET="your-jwt-secret"
export LLM_API_KEY="your-llm-key"
export HABIT_TRACKER_URL="https://early-wakeup-habit.vercel.app"  # optional override
./scripts/vercel-env-setup.sh
```

## Manual steps (every step via CLI)

### 1. Add env vars

Value from stdin (non-secret):

```bash
# MCP routing
echo "true" | vercel env add USE_MCP_PROTOCOL production
echo "true" | vercel env add USE_MCP_PROTOCOL preview
echo "true" | vercel env add USE_MCP_PROTOCOL development

# Routing on
echo "true" | vercel env add ENABLE_ROUTING production
echo "true" | vercel env add ENABLE_ROUTING preview
echo "true" | vercel env add ENABLE_ROUTING development

# Habit tracker base URL (MCP endpoint = $HABIT_TRACKER_URL/api/mcp)
echo "https://early-wakeup-habit.vercel.app" | vercel env add HABIT_TRACKER_URL production
echo "https://early-wakeup-habit.vercel.app" | vercel env add HABIT_TRACKER_URL preview
echo "https://early-wakeup-habit.vercel.app" | vercel env add HABIT_TRACKER_URL development
```

Secrets (you’ll be prompted if you omit the pipe):

```bash
# JWT for auth
echo "YOUR_JWT_SECRET" | vercel env add JWT_SECRET production
echo "YOUR_JWT_SECRET" | vercel env add JWT_SECRET preview
echo "YOUR_JWT_SECRET" | vercel env add JWT_SECRET development

# LLM key (Anthropic or OpenAI)
echo "YOUR_LLM_KEY" | vercel env add LLM_API_KEY production
echo "YOUR_LLM_KEY" | vercel env add LLM_API_KEY preview
echo "YOUR_LLM_KEY" | vercel env add LLM_API_KEY development
```

Optional:

```bash
echo "anthropic" | vercel env add LLM_PROVIDER production
echo "true" | vercel env add ALLOW_DEV_TOKEN production   # allow dev-token in prod
```

### 2. List / remove / pull

```bash
vercel env ls
vercel env rm SOME_VAR production   # remove one
vercel env pull .env.local           # pull into local file
```

### 3. Deploy

```bash
vercel                # preview
vercel --prod         # production
```

### 4. Inspect

```bash
vercel whoami
vercel project ls
vercel env ls
```

Variables used by this project:

| Variable | Used by | Notes |
|----------|---------|--------|
| `USE_MCP_PROTOCOL` | api/chat | `true` = MCP routing |
| `ENABLE_ROUTING` | api/chat | `false` = direct LLM only |
| `HABIT_TRACKER_URL` | mcp-registry, registry | Base URL; MCP = `$HABIT_TRACKER_URL/api/mcp` |
| `HABIT_TRACKER_MCP_URL` | mcp-registry | Optional; full MCP URL override |
| `JWT_SECRET` | api/_lib/auth | Required for auth |
| `LLM_API_KEY` | api/chat, llm client | Or `ANTHROPIC_API_KEY` |
| `LLM_PROVIDER` | llm client | `anthropic` (default) or `openai` |
| `LLM_MODEL` | api/chat, llm client | Optional model override |
| `ALLOW_DEV_TOKEN` | api/auth/dev-token | `true` = allow dev token in production |
