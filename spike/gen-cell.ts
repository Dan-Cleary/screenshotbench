import { Agent } from "@cursor/sdk";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const PROMPT = `You will be shown a screenshot of a user interface. Your task is to implement this UI as a single self-contained React component using only inline styles or a single <style> block. Use only standard HTML and CSS — no external libraries, no Tailwind, no shadcn, no design system imports. Match the structure, content, and layout you see in the screenshot as faithfully as you can. If a part of the screenshot is ambiguous (cropped, low-res, etc.), implement the most reasonable interpretation.

Save the implementation as a file named \`Component.tsx\` in the current working directory. The file must contain a single TypeScript React component with a default export. Do not include explanations, comments, or markdown in the file — code only. Do not create any other files.`;

const [, , imagePath, modelId = "composer-2"] = process.argv;
if (!imagePath) {
  console.error("usage: tsx gen-cell.ts <image.png> [modelId]");
  process.exit(1);
}
if (!process.env.CURSOR_API_KEY) {
  console.error("CURSOR_API_KEY not set");
  process.exit(1);
}

const ext = extname(imagePath).toLowerCase();
const mimeType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
const data = readFileSync(imagePath).toString("base64");

const cwd = mkdtempSync(join(tmpdir(), "screenshotbench-"));
console.error(`[spike] cwd=${cwd} model=${modelId} image=${imagePath} (${(data.length / 1024) | 0}KB b64)`);

const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY,
  model: { id: modelId },
  local: { cwd },
});

const t0 = Date.now();
const run = await agent.send({ text: PROMPT, images: [{ data, mimeType }] });

let assistantText = "";
for await (const event of run.stream()) {
  if (event.type === "assistant") {
    for (const block of event.message.content) {
      if (block.type === "text") {
        process.stderr.write(".");
        assistantText += block.text;
      }
    }
  } else if (event.type === "thinking") {
    process.stderr.write("~");
  } else if (event.type === "tool_use") {
    process.stderr.write("T");
  }
}
process.stderr.write("\n");

const result = await run.wait();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.error(`[spike] status=${result.status} duration=${elapsed}s assistantText=${assistantText.length} resultField=${(result.result ?? "").length}`);

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p, base));
    else out.push(p);
  }
  return out;
}

const generatedFiles = walk(cwd);
console.error(`[spike] cwd contains ${generatedFiles.length} files:`);
for (const f of generatedFiles) {
  console.error(`         ${f.replace(cwd, "")} (${statSync(f).size}B)`);
}

mkdirSync("output", { recursive: true });
const stamp = Date.now();
const outDir = join("output", `${modelId}-${stamp}`);
mkdirSync(outDir, { recursive: true });

const tsxFiles = generatedFiles.filter((f) => /\.(tsx|jsx|ts|js)$/.test(f));
for (const f of tsxFiles) {
  const rel = f.replace(cwd + "/", "");
  const dest = join(outDir, rel);
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, readFileSync(f));
}
writeFileSync(join(outDir, "_meta.json"), JSON.stringify({
  modelId,
  imagePath,
  status: result.status,
  durationMs: Date.now() - t0,
  assistantText,
  resultField: result.result ?? null,
  generatedFiles: generatedFiles.map((f) => f.replace(cwd, "")),
}, null, 2));
console.error(`[spike] copied ${tsxFiles.length} code files to ${outDir}/`);

await agent.close();
