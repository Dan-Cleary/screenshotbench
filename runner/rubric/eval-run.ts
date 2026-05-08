/**
 * Rubric evaluator. Renders one run's generated component in a real browser
 * (Playwright + esbuild standalone-compiled), executes the rubric's checks,
 * writes scores back to Convex.
 *
 * Usage:
 *   tsx runner/rubric/eval-run.ts <runId>
 *   tsx runner/rubric/eval-run.ts --reference prompthub-pricing
 *   tsx runner/rubric/eval-run.ts --all
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";
import type { Rubric, Category } from "./check-kinds.js";
import { runCheck, type CheckResult } from "./run-checks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const client = new ConvexHttpClient(url);

function loadRubric(refSlug: string): Rubric {
  const path = resolve(__dirname, `${refSlug}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

const PAGE_HTML = (componentSrc: string) => `<!doctype html>
<html><head>
<meta charset="utf-8">
<style>html,body,#root{margin:0;padding:0;min-height:100vh;}</style>
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

async function evaluateRun(runId: Id<"runs">): Promise<void> {
  const ctx = await client.query(api.runs.getRunWithContext, { runId });
  if (!ctx) {
    console.log(`[eval] runId=${runId} not found`);
    return;
  }
  const { run, reference } = ctx;
  if (run.status !== "complete" || !run.files?.length) {
    console.log(`[eval] runId=${runId} skipped (status=${run.status})`);
    return;
  }
  const entry =
    run.files.find((f) => f.path === "Component.tsx") ??
    run.files.find((f) => f.path.endsWith(".tsx")) ??
    run.files[0];

  let rubric: Rubric;
  try {
    rubric = loadRubric(reference.slug);
  } catch {
    console.log(`[eval] no rubric for ${reference.slug}, skipping`);
    return;
  }

  console.log(
    `[eval] ${reference.slug} × ${ctx.model.slug} (runId=${runId})`,
  );
  const browser = await chromium.launch({ headless: true });
  let categories: Category[] & { _result?: CheckResult[] }[] = [];
  let renderError: string | undefined;
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 853 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      renderError = renderError ?? `pageerror: ${e.message}`;
    });
    await page.setContent(PAGE_HTML(entry.content), { waitUntil: "load" });
    try {
      await page.waitForFunction(() => (window as unknown as { __rendered?: boolean }).__rendered === true, {
        timeout: 8000,
      });
    } catch {
      renderError = renderError ?? "component failed to render within 8s";
    }

    const out: typeof categories = [] as never;
    for (const cat of rubric.categories) {
      const results: CheckResult[] = [];
      for (const check of cat.checks) {
        results.push(await runCheck(page, check));
      }
      out.push({
        ...cat,
        _result: results,
      } as never);
    }
    categories = out;
    await browser.close();
  } catch (e) {
    await browser.close();
    renderError = e instanceof Error ? e.message : String(e);
  }

  const summary = categories.map((cat) => {
    const checks = (cat as unknown as { _result: CheckResult[] })._result;
    const passed = checks.filter((c) => c.passed).length;
    return {
      key: cat.key,
      passed,
      total: checks.length,
      checks,
    };
  });
  const totalPossible = summary.reduce((acc, c) => acc + c.total, 0) || 1;
  const totalPassed = summary.reduce((acc, c) => acc + c.passed, 0);
  const total = Math.round((totalPassed / totalPossible) * 100);

  console.log(
    `[eval]   total=${total}/100 ${summary
      .map((c) => `${c.key}=${c.passed}/${c.total}`)
      .join(" ")}${renderError ? ` (${renderError})` : ""}`,
  );

  await client.mutation(api.runs.setEvaluation, {
    runId,
    rubricVersion: rubric.version,
    total,
    categories: summary,
    errorMessage: renderError,
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
  console.log(`[eval] evaluating ${targets.length} run(s)`);
  for (const r of targets) await evaluateRun(r._id);
} else if (args[0]) {
  await evaluateRun(args[0] as Id<"runs">);
} else {
  console.error(
    "usage: tsx runner/rubric/eval-run.ts <runId> | --reference <slug> | --all",
  );
  process.exit(1);
}
