# screenshotbench

An open benchmark for how frontier coding models implement React UI from a single
reference screenshot. Live at **[screenshotbench.com](https://screenshotbench.com)**.

Each cell in the matrix is one model's attempt at one reference. Generated
components render live in a sandboxed iframe; an LLM judge scores visual
fidelity from 0–100 across four dimensions (layout, palette, polish,
completeness).

## What's in v0

- **6 models:** Claude Opus 4.7, Claude Sonnet 4.6, Gemini 3.1 Pro,
  Gemini 3 Flash, GPT-5.5, Composer 2
- **3 references:** PostHog homepage, PromptHub pricing, Mistral signup
- **18 graded cells**

## How it works

```
references (screenshots)
        +
      models  ────►  Cursor SDK (local mode)  ────►  Component.tsx
                                                          │
                                                          ▼
                                                Playwright render @ 1280×853
                                                          │
                                  ┌───────────────────────┴─────────────────────┐
                                  ▼                                             ▼
                          PNG thumbnail (Convex storage)              vision judge (GPT-5.5)
                                                                              │
                                                                              ▼
                                                                       score + reasoning
```

Each generation runs through the Cursor SDK in local mode against a fixed prompt.
The result lands in Convex. A second runner takes a desktop-width screenshot of
the rendered output and uploads it to storage so the matrix view serves static
images instead of live iframes (mobile Safari OOM-killed pages with 18
concurrent bundler instances). A third runner sends the reference + rendered
screenshots to the LLM judge and writes the score back.

The detail modal (tap any tile) mounts a single live Sandpack so you can drag
the splitter or hit Desktop/Tablet/Mobile to see how the component actually
responds at each breakpoint.

## Stack

- **Frontend** — React + Vite, deployed on Vercel
- **Backend** — Convex (`efficient-anteater-70`) for references, models, runs, judge results, and file storage
- **Generation** — `@cursor/sdk` in local mode (each cell spawns a `cursor-agent` against a temp cwd)
- **Render + judge** — Playwright (Chromium) + OpenAI Chat Completions vision
- **Live preview** — `@codesandbox/sandpack-react` (modal only)

## Repo layout

```
convex/         # schema, queries, mutations
src/            # React app (matrix view + detail modal)
runner/
  add-reference.ts        # add a screenshot to references table
  trigger-one.ts          # queue a single (ref, model) cell
  trigger-batch.ts        # queue all 6 models for a list of refs
  run-pending.ts          # external runner — drains queued runs via Cursor SDK
  render-previews.ts      # render generated components to PNG → Convex storage
  judge/judge-run.ts      # vision judge → score + per-dim reasoning
  rubric/                 # structural rubric pipeline (parked; not in current UI)
public/         # mascot, favicon, og.png
```

## Local dev

```sh
npm install
npx convex dev          # starts dev deployment, generates convex/_generated
npm run dev             # vite at http://localhost:5173
```

## Adding a new reference

```sh
cd runner
npx tsx add-reference.ts <slug> "<Name>" <category> /path/to/screenshot.png

# queue all 6 models for the new reference
npx tsx trigger-batch.ts   # edit targetSlugs first

# generate code with Cursor SDK
CURSOR_API_KEY=$(security find-generic-password -s CURSOR_API_KEY -w) \
  npx tsx run-pending.ts

# render thumbnails + judge
CONVEX_URL=https://efficient-anteater-70.convex.cloud \
  npx tsx render-previews.ts --reference <slug>

OPENAI_API_KEY=$(security find-generic-password -s OPENAI_API_KEY -w) \
  CONVEX_URL=https://efficient-anteater-70.convex.cloud \
  npx tsx judge/judge-run.ts --reference <slug>
```

## Deploy

`npm run build` runs `convex deploy --cmd "vite build"` — it pushes the backend
to the prod Convex deployment and then builds the static frontend. Vercel runs
this automatically on push to `main` (`CONVEX_DEPLOY_KEY` set as a project env
var).

For one-off local deploys: `vercel --prod`.

## License

MIT. Built by [Dan Cleary](https://x.com/danjcleary).
