import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  references: defineTable({
    slug: v.string(),
    name: v.string(),
    category: v.string(),
    screenshotStorageId: v.id("_storage"),
    addedAt: v.number(),
  }).index("by_slug", ["slug"]),

  models: defineTable({
    slug: v.string(),
    displayName: v.string(),
    provider: v.string(),
    cursorSdkModelId: v.string(),
    enabled: v.boolean(),
    addedAt: v.number(),
  }).index("by_slug", ["slug"]),

  batches: defineTable({
    triggeredBy: v.string(),
    notes: v.optional(v.string()),
  }),

  runs: defineTable({
    batchId: v.id("batches"),
    referenceId: v.id("references"),
    modelId: v.id("models"),
    status: v.union(
      v.literal("queued"),
      v.literal("generating"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    files: v.optional(
      v.array(v.object({ path: v.string(), content: v.string() })),
    ),
    assistantText: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_batch", ["batchId"])
    .index("by_reference_and_model", ["referenceId", "modelId"])
    .index("by_batch_and_reference_and_model", [
      "batchId",
      "referenceId",
      "modelId",
    ]),
});
