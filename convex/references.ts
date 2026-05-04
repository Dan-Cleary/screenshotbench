import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const refs = await ctx.db.query("references").take(100);
    return await Promise.all(
      refs.map(async (r) => ({
        ...r,
        screenshotUrl: await ctx.storage.getUrl(r.screenshotStorageId),
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    category: v.string(),
    screenshotStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("references")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      throw new Error(`reference with slug "${args.slug}" already exists`);
    }
    return await ctx.db.insert("references", {
      slug: args.slug,
      name: args.name,
      category: args.category,
      screenshotStorageId: args.screenshotStorageId,
      addedAt: Date.now(),
    });
  },
});
