/**
 * LLM judge. Renders one run's generated component, takes a desktop-width
 * screenshot, downloads the reference screenshot, sends both to a vision
 * model with a fixed rubric prompt, parses the JSON response, writes the
 * score back to Convex.
 *
 * Usage:
 *   OPENAI_API_KEY=$(security find-generic-password -s OPENAI_API_KEY -w) \
 *   tsx runner/judge/judge-run.ts --reference prompthub-pricing
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";

const JUDGE_MODEL = "gpt-5.5";

const SYSTEM_PROMPT = `You are an impartial visual fidelity judge for a public benchmark that compares how well frontier models implement UI from a screenshot.

You will be shown two images: (1) a REFERENCE screenshot (the ground-truth UI a model was asked to implement), and (2) a RENDERED screenshot of the actual React component the model produced.

Score the rendered output's visual fidelity to the reference on a scale of 0 to 100. Consider:
- Layout structure (overall composition, sections present, hierarchy, alignment)
- Color palette (background, accent colors, brand colors used in the right places)
- Polish (spacing, alignment, typography choices, no overlapping or clipped elements, no obvious layout breakage)
- Completeness (all sections, components, and content from the reference are present)

Do NOT penalize for:
- Pixel-perfect color matching (close palette is enough)
- Exact font choice (similar feeling is enough)
- Stock-image differences

Heavily penalize:
- Catastrophic layout failure (overlapping, exploded, cards bleeding outside their containers)
- Missing major sections
- Obvious visual breakage that no human would consider acceptable

Output ONLY a JSON object with this exact shape:
{
  "score": <0-100 integer>,
  "reasoning": "<one or two sentences explaining the score>",
  "dimensions": [
    { "key": "layout", "score": <0-25>, "note": "<short>" },
    { "key": "palette", "score": <0-25>, "note": "<short>" },
    { "key": "polish", "score": <0-25>, "note": "<short>" },
    { "key": "completeness", "score": <0-25>, "note": "<short>" }
  ]
}
The four dimension scores should sum to the overall score. Use the full 0-100 range — a perfect copy is 95-100, an obviously broken implementation is 20-40.`;

function loadDotEnvUrl(): string | undefined {
  try {
    const env = readFileSync(
      new URL("../../.env.local", import.meta.url),
      "utf8",
    );
    return env.match(/^VITE_CONVEX_URL=(.+)$/m)?.[1].trim();
  } catch {
    return undefined;
  }
}

const url =
  process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? loadDotEnvUrl();
if (!url) throw new Error("CONVEX_URL / VITE_CONVEX_URL not set");
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
const client = new ConvexHttpClient(url);

const PAGE_HTML = (componentSrc: string) => `<!doctype html>
<html><head>
<meta charset="utf-8">
<style>html,body,#root{margin:0;padding:0;min-height:100vh;background:#fff;}</style>
<script type="importmap">
{ "imports": {
  "react": "https://esm.sh/react@19.2.0",
  "react-dom": "https://esm.sh/react-dom@19.2.0",
  "react-dom/client": "https://esm.sh/react-dom@19.2.0/client",
  "react/jsx-runtime": "https://esm.sh/react@19.2.0/jsx-runtime",
  "react/jsx-dev-runtime": "https://esm.sh/react@19.2.0/jsx-dev-runtime"
}}
</script>
</head><body>
<div id="root"></div>
<script type="module">
import React from "react";
import { createRoot } from "react-dom/client";
import { transform } from "https://esm.sh/sucrase@3.35.0?bundle";
const src = ${JSON.stringify(componentSrc)};
const compiled = transform(src, { transforms: ["typescript", "jsx"], jsxRuntime: "automatic", production: true }).code;
const blob = new Blob([compiled], { type: "text/javascript" });
const url = URL.createObjectURL(blob);
const mod = await import(url);
const Component = mod.default;
createRoot(document.getElementById("root")).render(React.createElement(Component));
window.__rendered = true;
</script>
</body></html>`;

async function renderToScreenshot(componentSrc: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 853 },
    });
    const page = await context.newPage();
    await page.setContent(PAGE_HTML(componentSrc), { waitUntil: "load" });
    try {
      await page.waitForFunction(
        () => (window as unknown as { __rendered?: boolean }).__rendered === true,
        { timeout: 8000 },
      );
    } catch {
      // render failed; screenshot whatever we have
    }
    await page.waitForTimeout(500); // allow images/fonts
    const buf = await page.screenshot({ fullPage: true, type: "png" });
    return buf;
  } finally {
    await browser.close();
  }
}

async function fetchReferenceImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`reference fetch failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

type JudgeOutput = {
  score: number;
  reasoning: string;
  dimensions: { key: string; score: number; note?: string }[];
};

async function callJudge(
  referencePng: Buffer,
  renderedPng: Buffer,
): Promise<JudgeOutput> {
  const refB64 = referencePng.toString("base64");
  const renderedB64 = renderedPng.toString("base64");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "REFERENCE (target):" },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${refB64}` },
            },
            { type: "text", text: "RENDERED (model output):" },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${renderedB64}` },
            },
            { type: "text", text: "Return only the JSON object." },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`openai ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content) as JudgeOutput;
}

async function judgeOne(runId: Id<"runs">): Promise<void> {
  const ctx = await client.query(api.runs.getRunWithContext, { runId });
  if (!ctx) {
    console.log(`[judge] runId=${runId} not found`);
    return;
  }
  const { run, reference, model } = ctx;
  if (run.status !== "complete" || !run.files?.length) {
    console.log(`[judge] runId=${runId} skipped (status=${run.status})`);
    return;
  }
  const entry =
    run.files.find((f) => f.path === "Component.tsx") ??
    run.files.find((f) => f.path.endsWith(".tsx")) ??
    run.files[0];

  console.log(
    `[judge] ${reference.slug} × ${model.slug} (runId=${runId})`,
  );

  let renderedPng: Buffer;
  try {
    renderedPng = await renderToScreenshot(entry.content);
  } catch (e) {
    console.log(`[judge]   render failed: ${e}`);
    await client.mutation(api.runs.setJudge, {
      runId,
      model: JUDGE_MODEL,
      score: 0,
      reasoning: "render failed",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  if (!reference.screenshotUrl) {
    console.log(`[judge]   no reference screenshot URL`);
    return;
  }
  const referencePng = await fetchReferenceImage(reference.screenshotUrl);

  let result: JudgeOutput;
  try {
    result = await callJudge(referencePng, renderedPng);
  } catch (e) {
    console.log(`[judge]   judge call failed: ${e}`);
    await client.mutation(api.runs.setJudge, {
      runId,
      model: JUDGE_MODEL,
      score: 0,
      reasoning: "judge call failed",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  console.log(
    `[judge]   score=${result.score}/100 — ${result.reasoning.slice(0, 120)}`,
  );

  await client.mutation(api.runs.setJudge, {
    runId,
    model: JUDGE_MODEL,
    score: result.score,
    reasoning: result.reasoning,
    dimensions: result.dimensions,
  });
}

const args = process.argv.slice(2);
if (args[0] === "--all" || args[0] === "--reference") {
  const slug = args[0] === "--reference" ? args[1] : undefined;
  const { runs } = await client.query(api.runs.matrix);
  const refs = await client.query(api.references.list, {});
  const refIds = slug
    ? refs.filter((r) => r.slug === slug).map((r) => r._id)
    : refs.map((r) => r._id);
  const targets = runs.filter(
    (r) =>
      r.status === "complete" &&
      r.files?.length &&
      refIds.includes(r.referenceId),
  );
  console.log(`[judge] judging ${targets.length} run(s)`);
  for (const r of targets) await judgeOne(r._id);
} else if (args[0]) {
  await judgeOne(args[0] as Id<"runs">);
} else {
  console.error(
    "usage: tsx runner/judge/judge-run.ts <runId> | --reference <slug> | --all",
  );
  process.exit(1);
}
