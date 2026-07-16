# WhatsApp Simulator

Renders a pushed questionnaire as a chat. An upstream system POSTs a
questionnaire and a callback URL; the patient answers in a chat UI, replying in
free text and optionally quoting a specific question; the full conversation
transcript is POSTed back to the callback URL when they end the conversation. A
downstream agent is expected to combine the free-text replies. Emergency
check-ins instead run in a live turn-by-turn mode: each reply is POSTed to the
collector's `/turns`, which returns the next question (or a closing message) per
answer; the scripted one-shot questionnaire below still works unchanged.

Next.js (App Router) on the Bun runtime. Sessions are held in memory and reset
on restart. Request bodies are validated with zod, HTTP calls use ky, and logs
go through consola.

## Flow

1. `POST /api/sessions` with `{ questionnaire, callbackUrl }` returns
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

The home page has a Launch demo button that seeds the sample questionnaire and
points its callback at `/api/demo-callback`, an in-app receiver that logs each
transcript it gets — handy for watching the full round-trip in the logs.

## Develop

From this directory (needs Bun):

```sh
bun install
bun dev # http://localhost:3000
```

Tooling: `bun run format` (biome), `bun run lint` (eslint, antfu config),
`bun run knip` (unused files/deps), `bun run typecheck`.

## Docker

From the `hl7-ai-competition` directory:

```sh
make up # start in the background
make watch # foreground, rebuild on change
```

The UI is served on http://localhost:3000.
