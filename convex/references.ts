import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const refs = await ctx.db.query("references").take(100);
    refs.sort((a, b) => {
      const ao = a.displayOrder ?? 9999;
      const bo = b.displayOrder ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.addedAt - b.addedAt;
    });
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

export const setDisplayOrder = mutation({
  args: { referenceId: v.id("references"), displayOrder: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.referenceId, { displayOrder: args.displayOrder });
  },
});

export const remove = mutation({
  args: { referenceId: v.id("references") },
  handler: async (ctx, args) => {
    const ref = await ctx.db.get(args.referenceId);
    if (!ref) return;
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_reference_and_model", (q) =>
        q.eq("referenceId", args.referenceId),
      )
      .collect();
    for (const r of runs) await ctx.db.delete(r._id);
    await ctx.storage.delete(ref.screenshotStorageId);
    await ctx.db.delete(args.referenceId);
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
