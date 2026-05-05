/**
 * Add a single reference. Usage:
 *   tsx runner/add-reference.ts <slug> <name> <category> <imagePath>
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { api } from "../convex/_generated/api.js";

const [, , slug, name, category, imagePath] = process.argv;
if (!slug || !name || !category || !imagePath) {
  console.error("usage: tsx runner/add-reference.ts <slug> <name> <category> <imagePath>");
  process.exit(1);
}

function loadDotEnvUrl(): string | undefined {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return env.match(/^VITE_CONVEX_URL=(.+)$/m)?.[1].trim();
}
const client = new ConvexHttpClient(
  process.env.VITE_CONVEX_URL ?? loadDotEnvUrl()!,
);

const existing = await client.query(api.references.list, {});
if (existing.find((r) => r.slug === slug)) {
  console.log(`reference ${slug} already exists`);
  process.exit(0);
}

const uploadUrl = await client.mutation(api.references.generateUploadUrl, {});
const bytes = readFileSync(resolve(imagePath));
const res = await fetch(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: bytes,
});
if (!res.ok) throw new Error(`upload failed: ${res.status}`);
const { storageId } = (await res.json()) as { storageId: string };
const id = await client.mutation(api.references.create, {
  slug,
  name,
  category,
  screenshotStorageId: storageId as never,
});
console.log(`added reference ${slug} -> ${id}`);
