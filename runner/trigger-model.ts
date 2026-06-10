/**
 * Helper: queue one model across every reference. Use when adding a new model
 * to the benchmark — unlike trigger-batch.ts, this only queues cells for the
 * given model, so it won't re-run (and re-bill) the existing models' cells.
 *
 * Usage: tsx runner/trigger-model.ts <modelSlug>
 *   e.g. tsx runner/trigger-model.ts claude-fable-5
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../convex/_generated/api.js";

const [, , modelSlug] = process.argv;
if (!modelSlug) throw new Error("usage: tsx runner/trigger-model.ts <modelSlug>");

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

const refs = await client.query(api.references.list, {});
const models = await client.query(api.models.list, {});
const model = models.find((m) => m.slug === modelSlug);
if (!model) throw new Error(`model "${modelSlug}" not found (run seed.ts first?)`);
if (refs.length === 0) throw new Error("no references found");

for (const ref of refs) {
  const result = await client.mutation(api.runs.triggerCell, {
    referenceId: ref._id,
    modelId: model._id,
    notes: `trigger-model: ${ref.slug} × ${modelSlug}`,
  });
  console.log(`[trigger] queued ${ref.slug} × ${modelSlug} runId=${result.runId}`);
}

console.log(`[trigger] done — queued ${refs.length} cell(s) for ${modelSlug}`);
