import { Cursor } from "@cursor/sdk";

if (!process.env.CURSOR_API_KEY) {
  console.error("CURSOR_API_KEY not set");
  process.exit(1);
}

const models = await Cursor.models.list();

console.log(`Found ${models.length} models:\n`);
for (const m of models) {
  console.log(`  ${m.id.padEnd(40)} ${m.displayName ?? ""}`);
  if (m.description) console.log(`    ${m.description}`);
}
