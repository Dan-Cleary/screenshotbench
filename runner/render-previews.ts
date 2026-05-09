/**
 * Renders each completed run's component to a PNG thumbnail and uploads it
 * to Convex storage, replacing live Sandpack iframes in the matrix view
 * with static images. Mobile Safari was OOM-killing the page when 18
 * iframes mounted concurrently; this drops the matrix to 0 iframes.
 *
 * Usage:
 *   tsx runner/render-previews.ts --all
 *   tsx runner/render-previews.ts --reference <slug>
 *   tsx runner/render-previews.ts <runId>
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

function loadDotEnvUrl(): string | undefined {
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    return env.match(/^VITE_CONVEX_URL=(.+)$/m)?.[1].trim();
  } catch {
    return undefined;
  }
}

const url =
  process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? loadDotEnvUrl();
if (!url) throw new Error("CONVEX_URL / VITE_CONVEX_URL not set");
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

async function renderOne(
  componentSrc: string,
  browser: import("playwright").Browser,
): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 853 },
  });
  const page = await context.newPage();
  try {
    await page.setContent(PAGE_HTML(componentSrc), { waitUntil: "load" });
    try {
      await page.waitForFunction(
        () =>
          (window as unknown as { __rendered?: boolean }).__rendered === true,
        { timeout: 8000 },
      );
    } catch {
      // render failed; capture whatever we have
    }
    await page.waitForTimeout(500);
    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1280, height: 853 },
    });
    return buf;
  } finally {
    await context.close();
  }
}

async function uploadAndAttach(
  runId: Id<"runs">,
  png: Buffer,
): Promise<void> {
  const uploadUrl = await client.mutation(api.runs.generatePreviewUploadUrl, {});
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: png,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const { storageId } = (await res.json()) as { storageId: string };
  await client.mutation(api.runs.setPreviewStorage, {
    runId,
    storageId: storageId as never,
  });
}

async function processRun(
  runId: Id<"runs">,
  browser: import("playwright").Browser,
): Promise<void> {
  const ctx = await client.query(api.runs.getRunWithContext, { runId });
  if (!ctx) {
    console.log(`[preview] runId=${runId} not found`);
    return;
  }
  const { run, reference, model } = ctx;
  if (run.status !== "complete" || !run.files?.length) {
    console.log(`[preview] runId=${runId} skipped (status=${run.status})`);
    return;
  }
  const entry =
    run.files.find((f) => f.path === "Component.tsx") ??
    run.files.find((f) => f.path.endsWith(".tsx")) ??
    run.files[0];

  console.log(`[preview] ${reference.slug} × ${model.slug}`);
  let png: Buffer;
  try {
    png = await renderOne(entry.content, browser);
  } catch (e) {
    console.log(`[preview]   render failed: ${e}`);
    return;
  }
  try {
    await uploadAndAttach(runId, png);
    console.log(`[preview]   uploaded (${(png.length / 1024).toFixed(1)} KB)`);
  } catch (e) {
    console.log(`[preview]   upload failed: ${e}`);
  }
}

const args = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
try {
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
    console.log(`[preview] rendering ${targets.length} run(s)`);
    for (const r of targets) await processRun(r._id, browser);
  } else if (args[0]) {
    await processRun(args[0] as Id<"runs">, browser);
  } else {
    console.error(
      "usage: tsx runner/render-previews.ts <runId> | --reference <slug> | --all",
    );
    process.exit(1);
  }
} finally {
  await browser.close();
}
