import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { onlyEnabled: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("models").take(100);
    return args.onlyEnabled ? all.filter((m) => m.enabled) : all;
  },
});

export const upsert = mutation({
  args: {
    slug: v.string(),
    displayName: v.string(),
    provider: v.string(),
    cursorSdkModelId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("models")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        provider: args.provider,
        cursorSdkModelId: args.cursorSdkModelId,
        enabled: args.enabled,
      });
      return existing._id;
    }
    return await ctx.db.insert("models", {
      slug: args.slug,
      displayName: args.displayName,
      provider: args.provider,
      cursorSdkModelId: args.cursorSdkModelId,
      enabled: args.enabled,
      addedAt: Date.now(),
    });
  },
});
