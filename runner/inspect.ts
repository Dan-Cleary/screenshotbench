import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../convex/_generated/api.js";

function loadDotEnvUrl(): string | undefined {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return env.match(/^VITE_CONVEX_URL=(.+)$/m)?.[1].trim();
}
const client = new ConvexHttpClient(
  process.env.VITE_CONVEX_URL ?? loadDotEnvUrl()!,
);

const { runs } = await client.query(api.runs.matrix);
console.log(`runs=${runs.length}`);
for (const r of runs) {
  console.log(
    `  run=${r._id} status=${r.status} files=${r.files?.length ?? 0} duration=${r.durationMs ?? "-"}ms`,
  );
  if (r.files?.[0]) {
    console.log(`  --- ${r.files[0].path} (${r.files[0].content.length} bytes) ---`);
    console.log(r.files[0].content.slice(0, 400));
  }
}
