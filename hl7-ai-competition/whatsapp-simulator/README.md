# WhatsApp Simulator

Renders a pushed questionnaire as a chat. An upstream system POSTs a
questionnaire and a callback URL; the patient answers in a chat UI, replying in
free text and optionally quoting a specific question; the full conversation
transcript is POSTed back to the callback URL when they end the conversation. A
downstream agent is expected to combine the free-text replies.

Next.js (App Router) on the Bun runtime. Sessions are held in memory and reset
on restart.

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
    { "id": "breath", "text": "How is your breathlessness?", "type": "choice", "options": ["None", "Mild", "Severe"], "required": true }
  ]
}
```

`type` is one of `text`, `choice`, `boolean`, `number`. It only drives how a
question is presented; every reply is recorded verbatim.

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
make up # docker compose up -d --build
```

The UI is served on http://localhost:3000.
