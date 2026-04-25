# BridgeFlow Operator

> **An autonomous 5-agent sales floor — every agent is Claude Opus 4.7.**
> Drop in a sales call transcript, watch five specialist agents reason through it in real time, and end up with a qualified lead, a personalised follow-up campaign, an action manifest that *actually* fires Telegram + Resend, and a self-audited rep briefing — in roughly the time it takes to refill your coffee.

Built for the **Built with Opus 4.7** hackathon.

---

## What it does

A single sales call goes in. Five specialist agents — each running on `claude-opus-4-7` — pass structured JSON down a pipeline. The output isn't a chat reply; it's *operations*:

- a row in your CRM
- a Telegram alert to the rep on every HOT lead
- real follow-up emails sent by Resend within seconds of the call ending
- a self-graded QA report that calls itself out when something is sketchy

Everything streams over Server-Sent Events, so the dashboard shows each agent thinking live — not a spinner waiting for a single 30-second response.

---

## The 5-agent architecture

```
                ┌─────────────────────────────────────┐
                │  Sales call transcript (raw text)   │
                └─────────────────┬───────────────────┘
                                  │
                                  ▼
        ┌────────────────────────────────────────────────┐
        │ Agent 1 · Call Analyst      (Opus 4.7, stream) │
        │   intent · budget · timeline · objections      │
        │   prospect contact info · sentiment            │
        └────────────────────┬───────────────────────────┘
                             │   structured JSON
                             ▼
        ┌────────────────────────────────────────────────┐
        │ Agent 2 · Lead Qualifier    (Opus 4.7, stream) │
        │   HOT / WARM / COLD + confidence + reasoning   │
        │   decisive next action                         │
        └────────────────────┬───────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────┐
        │ Agent 3 · Campaign Architect(Opus 4.7, stream) │
        │   3-touch personalised email sequence          │
        │   CRM note · talking points                    │
        └────────────────────┬───────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────┐
        │ Agent 4 · Action Executor   (Opus 4.7, stream) │
        │   action manifest:                             │
        │     send_email · send_telegram                 │
        │     log_crm · book_meeting · archive           │
        └─────────┬────────────────────────────┬─────────┘
                  │                            │
        ╔═════════▼═════════╗        ╔═════════▼═════════╗
        ║ Resend HTTP API   ║        ║ Telegram Bot API  ║
        ║ (real follow-up   ║        ║ (HOT-lead alert   ║
        ║  emails fire)     ║        ║  to the rep)      ║
        ╚═════════╤═════════╝        ╚═════════╤═════════╝
                  │  real outcomes (sent / failed)        │
                  └────────────────┬─────────────────────┘
                                   ▼
        ┌────────────────────────────────────────────────┐
        │ Agent 5 · Reflection        (Opus 4.7, stream) │
        │   QA pass over agents 1-4 + real send results  │
        │   flags · missed opportunities                 │
        │   plain-English rep briefing                   │
        └────────────────────┬───────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────┐
        │ Supabase · calls · analyses · leads · actions  │
        │ Dashboard · live SSE stream · /leads board     │
        └────────────────────────────────────────────────┘
```

Each arrow is a JSON contract — Agent N's parsed output becomes Agent N+1's user message. After Agent 4, the integrations fire **before** Agent 5 runs, so the reflection grades *what actually happened*, not what was planned.

---

## Tech stack

| Layer       | Choice                                         | Why                                              |
| ----------- | ---------------------------------------------- | ------------------------------------------------ |
| Model       | `claude-opus-4-7` via `AsyncAnthropic.stream`  | Best reasoning, native streaming, JSON-reliable  |
| Backend     | FastAPI + `sse-starlette`                      | One async process, true SSE, low overhead        |
| Frontend    | Next.js 14 App Router + TypeScript + Tailwind  | Live agent panels, lead board, PDF report export |
| DB          | Supabase (Postgres + REST)                     | `calls` · `analyses` · `leads` · `actions`       |
| Email       | Resend HTTP API                                | One curl-style call, message ids back in seconds |
| Alerts      | Telegram Bot API                               | Reps get a buzz the moment a HOT lead lands      |
| Validation  | Pydantic v2 schemas                            | Strict request bodies, typed events              |

Dependencies are deliberately minimal — see `backend/requirements.txt` (8 packages) and `frontend/package.json`.

---

## Run it

### Prereqs
- Python 3.11+, Node 18+
- An Anthropic API key with Opus 4.7 access
- *(optional)* Resend API key, Telegram bot token, Supabase project

### 1. Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

cp ../.env.example ../.env
# fill in ANTHROPIC_API_KEY (required) and the optional integrations

uvicorn main:app --reload --port 8000
```

```bash
curl http://localhost:8000/health
# { "status": "ok", "model": "claude-opus-4-7", ... }
```

### 2. CLI smoke test (no frontend needed)

```bash
cd backend
python run_pipeline.py            # streams all 5 agents on demo_transcript.txt
python test_hot_lead_send.py you@example.com   # also fires real Resend + Telegram
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

Open the dashboard → **Load demo** → **Run 5-agent pipeline**. Five panels stream simultaneously, the lead board fills in, and the PDF report is one click.

### 4. Supabase (optional)

```bash
psql "$SUPABASE_DB_URL" < supabase/migrations/0001_init.sql
```

Tables: `calls`, `analyses`, `leads`, `actions`. If unconfigured, the pipeline still runs — Supabase calls are no-ops and the UI falls back to seeded demo leads.

---

## API

`POST /analyze` — body `{ "transcript": "Agent: ...\nProspect: ..." }`, returns `text/event-stream`.

| Event                  | Payload                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `pipeline_start`       | `{ call_id }`                                                 |
| `agent_start`          | `{ agent, index }`                                            |
| `agent_delta`          | `{ agent, index, delta }`  ← live thinking                    |
| `agent_complete`       | `{ agent, index, output }`  ← parsed JSON                     |
| `integrations_start`   | `{}`  (after Agent 4)                                         |
| `integrations_complete`| `{ telegram, emails, actions }`                               |
| `pipeline_complete`    | `{ call_id, results }`                                        |
| `error`                | `{ agent?, message }`                                         |

`GET /health` · `GET /config` (which integrations are live) · `GET /leads?limit=N`

---

## Built with Opus 4.7

Opus 4.7 isn't a feature of this project — it *is* the project. Every reasoning step in the pipeline, top to bottom, is Opus 4.7. There is no fallback model, no rules engine behind the curtain, no regex doing the actual work.

**One model, five specialist personas.** Each agent ships its own `SYSTEM` prompt under `backend/agents/<agent>.py`. The Call Analyst is told to be a forensic listener; the Lead Qualifier is told to be brutally decisive; the Campaign Architect is told to write like a human SDR who actually listened to the call; the Action Executor is told to output a strict action-manifest schema; the Reflection agent is told to grade itself honestly, including flagging when earlier agents fabricated data. Same model, five different jobs, no fine-tuning required.

**Live streaming, not turn-taking.** Each agent runs through `AsyncAnthropic.messages.stream`, and we ship every text delta straight to the browser as an `agent_delta` SSE event. The UI shows five panels lighting up in sequence with the model's actual token-by-token reasoning — not a "thinking…" spinner. See `backend/agents/base.py:31`.

**Structured JSON without tool calls.** Every agent emits a strict JSON object. We stream the raw text, then parse once it's complete with a brace-matching extractor (`extract_json` in `backend/agents/base.py:56`) that tolerates stray prose or markdown fences. Opus 4.7 is reliable enough that we don't need the constraint of native tool-use to get clean structured output — the schemas live in the system prompts and the model honours them.

**Reflection over real outcomes.** After Agent 4 produces its action manifest, we *actually fire* Resend and Telegram, mutate the action statuses with the real send results (message ids, error strings), and *then* invoke Agent 5. So the QA agent grades what actually happened — and in our hackathon test run it correctly flagged that the prospect's email had been overridden, even though no agent told it. That's Opus 4.7 catching a discrepancy across agent outputs by reasoning about them, not by being prompted to look.

**Why Opus 4.7 specifically.** Sonnet hallucinated email addresses in early tests; smaller models lost the JSON contract on long transcripts. Opus 4.7 holds the schema across all five agents, generates personalised copy that references specific moments from the transcript (the lost Plano deal, the $5k approval ceiling, the Follow Up Boss complaint), and is honest enough during reflection to flag its *own* assumptions. The whole product depends on that combination.

```python
# backend/agents/base.py
MODEL = "claude-opus-4-7"

async def stream_agent(system: str, user: str) -> AsyncIterator[str]:
    client = _get_client()
    async with client.messages.stream(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

That's the entire model layer. Everything else in the repo is plumbing around this 14-line function.

---

## Layout

```
bridgeflow-operator/
├── backend/
│   ├── main.py                FastAPI app + SSE pipeline
│   ├── agents/
│   │   ├── base.py            Opus 4.7 streaming runtime
│   │   ├── call_analyst.py        Agent 1
│   │   ├── lead_qualifier.py      Agent 2
│   │   ├── campaign_architect.py  Agent 3
│   │   ├── action_executor.py     Agent 4
│   │   └── reflection_agent.py    Agent 5
│   ├── integrations/
│   │   ├── resend.py          real follow-up email sends
│   │   └── telegram.py        HOT-lead rep alerts
│   ├── db/supabase_client.py
│   ├── models/schemas.py      Pydantic request + event types
│   ├── run_pipeline.py        CLI smoke test
│   ├── test_hot_lead_send.py  end-to-end test with real sends
│   └── requirements.txt
├── frontend/
│   └── app/
│       ├── page.tsx                     home / pipeline runner
│       ├── leads/page.tsx               live lead board
│       ├── api/analyze/route.ts         proxy → backend SSE
│       ├── lib/useAgentStream.ts        SSE parser + state machine
│       └── components/                  AgentStream · LeadReport · ActionManifest · Sparkline · ScoreBadge · …
├── supabase/migrations/0001_init.sql    calls · analyses · leads · actions
├── demo_transcript.txt                  Frisco Realty / Jake & David
└── .env.example
```

---

## Demo

`demo_transcript.txt` is a real-feeling sales call: a Texas realtor losing $15-20k/quarter to slow follow-up. Running it through BridgeFlow Operator produces:

- **Score:** HOT (≈85% confidence)
- **Telegram alert** to the rep within seconds, with the exact blocker called out (sub-$5k pilot ceiling)
- **Resend email** out to the prospect with personalised copy referencing the Plano deal he mentioned
- **Reflection** that flags any assumed email addresses and queues the right human-review items before Thursday's working session

End-to-end, including five Opus 4.7 streams + two real network sends, in well under a minute.

---

Built in a few late nights. Powered by Claude Opus 4.7.
