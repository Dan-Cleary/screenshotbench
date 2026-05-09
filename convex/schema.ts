import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  references: defineTable({
    slug: v.string(),
    name: v.string(),
    category: v.string(),
    screenshotStorageId: v.id("_storage"),
    addedAt: v.number(),
    displayOrder: v.optional(v.number()),
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
    previewStorageId: v.optional(v.id("_storage")),
    judge: v.optional(
      v.object({
        scoredAt: v.number(),
        model: v.string(),
        score: v.number(),
        reasoning: v.string(),
        dimensions: v.optional(
          v.array(
            v.object({
              key: v.string(),
              score: v.number(),
              note: v.optional(v.string()),
            }),
          ),
        ),
        errorMessage: v.optional(v.string()),
      }),
    ),
    evaluation: v.optional(
      v.object({
        scoredAt: v.number(),
        rubricVersion: v.string(),
        total: v.number(),
        categories: v.array(
          v.object({
            key: v.string(),
            passed: v.number(),
            total: v.number(),
            checks: v.array(
              v.object({
                id: v.string(),
                label: v.string(),
                passed: v.boolean(),
                detail: v.optional(v.string()),
              }),
            ),
          }),
        ),
        errorMessage: v.optional(v.string()),
      }),
    ),
  })
    .index("by_batch", ["batchId"])
    .index("by_reference_and_model", ["referenceId", "modelId"])
    .index("by_batch_and_reference_and_model", [
      "batchId",
      "referenceId",
      "modelId",
    ]),
});
