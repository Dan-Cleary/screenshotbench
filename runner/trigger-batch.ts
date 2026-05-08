import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../convex/_generated/api.js";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^VITE_CONVEX_URL=(.+)$/m)![1].trim();
const c = new ConvexHttpClient(url);

const refs = await c.query(api.references.list, {});
const models = await c.query(api.models.list, {});
const targetSlugs = ["mistral-signup", "posthog-home"];
console.log("models:", models.map((m: any) => m.slug).join(", "));

for (const slug of targetSlugs) {
  const ref = refs.find((r: any) => r.slug === slug);
  if (!ref) { console.log(`skip ${slug}: not found`); continue; }
  for (const m of models) {
    const r = await c.mutation(api.runs.triggerCell, {
      referenceId: ref._id, modelId: m._id, notes: `batch ${slug} × ${m.slug}`,
    });
    console.log(`queued ${slug} × ${m.slug} runId=${r.runId}`);
  }
}
