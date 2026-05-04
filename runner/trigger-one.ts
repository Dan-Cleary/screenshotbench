/**
 * Helper: queue one (reference, model) cell for testing. Defaults to the
 * placeholder-pricing reference + composer-2 model.
 *
 * Usage: tsx runner/trigger-one.ts [referenceSlug] [modelSlug]
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../convex/_generated/api.js";

const [, , refSlug = "placeholder-pricing", modelSlug = "composer-2"] =
  process.argv;

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
const ref = refs.find((r) => r.slug === refSlug);
const model = models.find((m) => m.slug === modelSlug);
if (!ref) throw new Error(`reference "${refSlug}" not found`);
if (!model) throw new Error(`model "${modelSlug}" not found`);

const result = await client.mutation(api.runs.triggerCell, {
  referenceId: ref._id,
  modelId: model._id,
  notes: `manual trigger: ${refSlug} × ${modelSlug}`,
});
console.log(`[trigger] queued runId=${result.runId} batchId=${result.batchId}`);
