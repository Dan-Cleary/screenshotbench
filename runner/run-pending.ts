/**
 * External runner. Polls Convex for queued runs, calls the Cursor SDK locally,
 * writes results back. Lives outside Convex because the SDK spawns a local
 * cursor-agent process and reads files from a real cwd — Convex Node actions
 * can't do either.
 *
 * Usage:
 *   CURSOR_API_KEY=$(security find-generic-password -s CURSOR_API_KEY -w) \
 *   tsx runner/run-pending.ts
 */
import { Agent } from "@cursor/sdk";
import { ConvexHttpClient } from "convex/browser";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api } from "../convex/_generated/api.js";
import type { Id } from "../convex/_generated/dataModel.js";

const PROMPT = `You will be shown a screenshot of a user interface. Your task is to implement this UI as a single self-contained React component using only inline styles or a single <style> block. Use only standard HTML and CSS — no external libraries, no Tailwind, no shadcn, no design system imports. Match the structure, content, and layout you see in the screenshot as faithfully as you can. If a part of the screenshot is ambiguous (cropped, low-res, etc.), implement the most reasonable interpretation.

Save the implementation as a file named \`Component.tsx\` in the current working directory. The file must contain a single TypeScript React component with a default export. Do not include explanations, comments, or markdown in the file — code only. Do not create any other files.`;

const CONVEX_URL =
  process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL ?? loadDotEnvUrl();
if (!CONVEX_URL) throw new Error("CONVEX_URL / VITE_CONVEX_URL not set");
if (!process.env.CURSOR_API_KEY) throw new Error("CURSOR_API_KEY not set");

const client = new ConvexHttpClient(CONVEX_URL);

function loadDotEnvUrl(): string | undefined {
  try {
    const env = readFileSync(
      new URL("../.env.local", import.meta.url),
      "utf8",
    );
    const m = env.match(/^VITE_CONVEX_URL=(.+)$/m);
    return m?.[1].trim();
  } catch {
    return undefined;
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function runOne(runId: Id<"runs">) {
  const ctx = await client.query(api.runs.getRunWithContext, { runId });
  const { reference, model } = ctx;
  if (!reference.screenshotUrl) throw new Error("no screenshot url");

  console.log(
    `[runner] runId=${runId} ref=${reference.slug} model=${model.cursorSdkModelId}`,
  );
  await client.mutation(api.runs.markGenerating, { runId });

  const t0 = Date.now();
  try {
    const imageRes = await fetch(reference.screenshotUrl);
    const imageBuf = Buffer.from(await imageRes.arrayBuffer());
    const data = imageBuf.toString("base64");
    const mimeType = imageRes.headers.get("content-type") ?? "image/png";

    const cwd = mkdtempSync(join(tmpdir(), "screenshotbench-"));
    const agent = await Agent.create({
      apiKey: process.env.CURSOR_API_KEY,
      model: { id: model.cursorSdkModelId },
      local: { cwd },
    });

    const run = await agent.send({ text: PROMPT, images: [{ data, mimeType }] });

    let assistantText = "";
    for await (const event of run.stream()) {
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") assistantText += block.text;
        }
      }
    }
    const result = await run.wait();
    if (result.status !== "finished") {
      throw new Error(`run status=${result.status}`);
    }

    const filePaths = walk(cwd);
    const files = filePaths.map((p) => ({
      path: p.replace(cwd + "/", ""),
      content: readFileSync(p, "utf8"),
    }));

    if (files.length === 0) {
      // Fallback: model returned code in chat (decision A's prompt should
      // prevent this, but log it for visibility).
      console.warn(
        `[runner] model ${model.slug} returned text instead of files; storing as Component.tsx`,
      );
      const code = assistantText
        .replace(/^```(?:tsx|ts|jsx|js)?\n?/m, "")
        .replace(/\n?```\s*$/m, "");
      files.push({ path: "Component.tsx", content: code });
    }

    await client.mutation(api.runs.markComplete, {
      runId,
      files,
      assistantText,
      durationMs: Date.now() - t0,
    });
    await agent.close();
    console.log(
      `[runner] complete runId=${runId} files=${files.length} duration=${Date.now() - t0}ms`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[runner] failed runId=${runId}: ${message}`);
    await client.mutation(api.runs.markFailed, { runId, errorMessage: message });
  }
}

async function main() {
  const queued = await client.query(api.runs.listQueued, { limit: 20 });
  if (queued.length === 0) {
    console.log("[runner] no queued runs");
    return;
  }
  console.log(`[runner] processing ${queued.length} run(s)`);
  // Sequential for now; parallelize later.
  for (const r of queued) {
    await runOne(r._id);
  }
}

await main();
