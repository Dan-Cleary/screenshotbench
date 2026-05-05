import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Returns the latest run per (referenceId, modelId) cell across all batches.
export const matrix = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("runs").order("desc").take(1000);
    const latestByCell = new Map<string, (typeof all)[number]>();
    for (const r of all) {
      const key = `${r.referenceId}:${r.modelId}`;
      if (!latestByCell.has(key)) latestByCell.set(key, r);
    }
    return { runs: Array.from(latestByCell.values()) };
  },
});

export const byCell = query({
  args: { referenceId: v.id("references"), modelId: v.id("models") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_reference_and_model", (q) =>
        q.eq("referenceId", args.referenceId).eq("modelId", args.modelId),
      )
      .order("desc")
      .first();
  },
});

// Used by the external runner to find work.
export const listQueued = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const queued = await ctx.db
      .query("runs")
      .withIndex("by_batch")
      .order("desc")
      .take(200);
    return queued.filter((r) => r.status === "queued").slice(0, limit);
  },
});

// Used by the external runner to load all data needed for a single SDK call.
export const getRunWithContext = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("run not found");
    const ref = await ctx.db.get(run.referenceId);
    const model = await ctx.db.get(run.modelId);
    if (!ref || !model) throw new Error("reference or model missing");
    const screenshotUrl = await ctx.storage.getUrl(ref.screenshotStorageId);
    return { run, reference: { ...ref, screenshotUrl }, model };
  },
});

export const markGenerating = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "generating",
      startedAt: Date.now(),
    });
  },
});

export const markComplete = mutation({
  args: {
    runId: v.id("runs"),
    files: v.array(v.object({ path: v.string(), content: v.string() })),
    assistantText: v.string(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "complete",
      files: args.files,
      assistantText: args.assistantText,
      durationMs: args.durationMs,
      completedAt: Date.now(),
    });
  },
});

export const markFailed = mutation({
  args: { runId: v.id("runs"), errorMessage: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });
  },
});

export const triggerCell = mutation({
  args: {
    referenceId: v.id("references"),
    modelId: v.id("models"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const batchId = await ctx.db.insert("batches", {
      triggeredBy: "manual",
      notes: args.notes,
    });
    const runId = await ctx.db.insert("runs", {
      batchId,
      referenceId: args.referenceId,
      modelId: args.modelId,
      status: "queued",
    });
    return { batchId, runId };
  },
});
