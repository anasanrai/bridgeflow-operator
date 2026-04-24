# BridgeFlow Operator

Autonomous 5-agent sales pipeline powered by **Claude Opus 4.7**
(`claude-opus-4-7`). Feed it a sales call transcript and it
returns a fully qualified lead, a personalized follow-up sequence, a
precise action manifest, and a self-reviewed rep briefing — end-to-end,
streamed live.

Built for the **Built with Opus 4.7** hackathon.

## The 5 agents

1. **Call Analyst** — extracts intent, budget, timeline, sentiment, objections
2. **Lead Qualifier** — HOT / WARM / COLD with decisive next action
3. **Campaign Architect** — personalized 3-touch email sequence + CRM note
4. **Action Executor** — concrete action manifest (email / telegram / book / archive)
5. **Reflection** — QA pass + plain-English rep briefing

Each agent runs on Opus 4.7 with streaming enabled, so the UI shows every
agent's reasoning as it thinks. Each agent's parsed output feeds into the
next agent's context.

## Stack

- **Backend**: FastAPI + Anthropic Python SDK (`AsyncAnthropic`), SSE streaming
- **Frontend**: Next.js 14 App Router + TypeScript + Tailwind
- **DB**: Supabase (optional — pipeline runs without it)

## Run it

### 1. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp ../.env.example ../.env
# put your ANTHROPIC_API_KEY into .env

uvicorn main:app --reload --port 8000
```

Check it's live: `curl http://localhost:8000/health`

### 2. CLI smoke test

```bash
cd backend
python run_pipeline.py        # runs ../demo_transcript.txt through all 5 agents
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 · click **Load demo** · **Run 5-agent pipeline**.

## API

`POST /analyze`

```json
{ "transcript": "Agent: Hey...\nProspect: ..." }
```

Returns `text/event-stream` with these event types:

| type | payload |
| --- | --- |
| `pipeline_start` | `{ call_id }` |
| `agent_start` | `{ agent, index }` |
| `agent_delta` | `{ agent, index, delta }` |
| `agent_complete` | `{ agent, index, output }` |
| `pipeline_complete` | `{ call_id, results }` |
| `error` | `{ agent?, message }` |

## Supabase

Optional. If `SUPABASE_URL` + `SUPABASE_KEY` are set, every call,
analysis, lead, and action is persisted. Run the migration:

```bash
psql "$SUPABASE_DB_URL" < supabase/migrations/0001_init.sql
```

Tables: `calls`, `analyses`, `leads`, `actions`.

## Layout

```
bridgeflow-operator/
├── backend/
│   ├── main.py              FastAPI + SSE pipeline
│   ├── agents/              5 agent modules + shared streaming runtime
│   ├── models/schemas.py    Pydantic request/event schemas
│   ├── db/supabase_client.py
│   ├── run_pipeline.py      CLI smoke test
│   └── requirements.txt
├── frontend/
│   └── app/
│       ├── page.tsx                main UI
│       ├── api/analyze/route.ts    proxy → backend SSE
│       ├── lib/useAgentStream.ts   SSE parser + state machine
│       └── components/             TranscriptUpload, AgentStream, LeadReport, ActionPanel
├── supabase/migrations/0001_init.sql
├── demo_transcript.txt
└── .env.example
```
