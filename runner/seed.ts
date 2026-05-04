/**
 * Seed: insert the v0 model set and upload one reference screenshot.
 * Idempotent — safe to re-run.
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../convex/_generated/api.js";

const MODELS = [
  { slug: "composer-2", displayName: "Composer 2", provider: "Cursor", cursorSdkModelId: "composer-2" },
  { slug: "claude-sonnet-4-6", displayName: "Sonnet 4.6", provider: "Anthropic", cursorSdkModelId: "claude-sonnet-4-6" },
  { slug: "claude-opus-4-7", displayName: "Opus 4.7", provider: "Anthropic", cursorSdkModelId: "claude-opus-4-7" },
  { slug: "gemini-3.1-pro", displayName: "Gemini 3.1 Pro", provider: "Google", cursorSdkModelId: "gemini-3.1-pro" },
  { slug: "gemini-3-flash", displayName: "Gemini 3 Flash", provider: "Google", cursorSdkModelId: "gemini-3-flash" },
  { slug: "gpt-5.5", displayName: "GPT-5.5", provider: "OpenAI", cursorSdkModelId: "gpt-5.5" },
];

const REFERENCE = {
  slug: "placeholder-pricing",
  name: "Placeholder Pricing",
  category: "pricing",
  imagePath: new URL("../spike/test-input/placeholder.png", import.meta.url),
};

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

console.log("[seed] inserting models");
for (const m of MODELS) {
  await client.mutation(api.models.upsert, { ...m, enabled: true });
  console.log(`  ${m.slug}`);
}

console.log("[seed] uploading reference screenshot");
const existing = await client.query(api.references.list, {});
const already = existing.find((r) => r.slug === REFERENCE.slug);
if (already) {
  console.log(`  ${REFERENCE.slug} already exists, skipping upload`);
} else {
  const uploadUrl = await client.mutation(api.references.generateUploadUrl, {});
  const bytes = readFileSync(REFERENCE.imagePath);
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${res.statusText}`);
  const { storageId } = (await res.json()) as { storageId: string };
  await client.mutation(api.references.create, {
    slug: REFERENCE.slug,
    name: REFERENCE.name,
    category: REFERENCE.category,
    screenshotStorageId: storageId as never,
  });
  console.log(`  ${REFERENCE.slug} uploaded (storageId=${storageId})`);
}

console.log("[seed] done");
