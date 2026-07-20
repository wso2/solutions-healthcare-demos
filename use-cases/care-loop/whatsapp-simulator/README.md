# WhatsApp Simulator

Renders a pushed questionnaire as a chat. An upstream system POSTs a
questionnaire and a callback URL; the patient answers in a chat UI, replying in
free text and optionally quoting a specific question. A downstream agent is
expected to combine the free-text replies.

Two modes:

- **Scripted one-shot** - all questions are shown at once; the full conversation
  transcript is POSTed back to the callback URL when the patient ends the
  conversation.
- **Live turn-by-turn** (emergency check-ins) - each reply is POSTed to the
  collector's `/turns` (via `/api/sessions/{id}/messages`), which returns the
  next question (or a closing message) per answer. The chat stays open for
  follow-ups rather than submitting a transcript. The scripted mode still works
  unchanged.

Next.js (App Router) on the Bun runtime. Sessions are held in memory and reset
on restart. Request bodies are validated with zod, HTTP calls use ky, and logs
go through consola.

## Flow

1. `POST /api/sessions` with `{ questionnaire, callbackUrl }` (optionally
   `live: { turnUrl }`, `patientId`, `patientName`) returns
   `201 { id, path, url }`.
2. The patient opens `/q/<id>`. All questions are shown at once; they reply in
   free text and can hover a question to quote it in their reply.
3. On End conversation, the transcript is POSTed to `callbackUrl`:

   ```json
   {
     "sessionId": "...",
     "title": "Daily heart check-in",
     "messages": [
       { "role": "bot", "text": "How is your breathlessness?", "time": "06:34 PM", "questionId": "breath" },
       { "role": "user", "text": "mild lately", "time": "06:35 PM",
         "replyTo": { "questionId": "breath", "questionText": "How is your breathlessness?" } }
     ]
   }
   ```

## Questionnaire shape

```json
{
  "title": "Daily heart check-in",
  "description": "optional",
  "questions": [
    { "id": "breath", "text": "How is your **breathlessness** today?" }
  ]
}
```

A question is just an `id` and `text`. The `text` is rendered as Markdown in the
chat; every reply is recorded verbatim.

## Demo

The home page polls the session list and offers two buttons:

- **Launch scripted demo** - seeds the sample questionnaire with its callback
  pointed at `/api/demo-callback` (an in-app receiver that logs each transcript
  it gets) and opens the one-shot chat; handy for watching the full round-trip
  in the logs.
- **Open live check-in** - forces a fresh vitals cycle
  (`POST /api/trigger-check` against the healthkit simulator) and opens whichever
  live session the real pipeline (vitals -> ML risk -> adaptive agent)
  escalates. If nobody crosses the risk threshold that cycle, it says so rather
  than falling back to the scripted demo.

## Develop

From this directory (needs Bun):

```sh
bun install
bun dev # http://localhost:3000
```

Tooling: `bun run format` (biome), `bun run lint` (eslint, antfu config),
`bun run knip` (unused files/deps), `bun run typecheck`.

## Docker

From the `use-cases/care-loop` directory:

```sh
make up # start in the background
make watch # foreground, rebuild on change
```

The container listens on 3000 but is published on the host as 3001, so the UI is
served on http://localhost:3001.
