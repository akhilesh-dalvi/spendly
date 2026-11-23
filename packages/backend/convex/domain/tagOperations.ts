// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.

import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAXIMUM_TAGS = 1000;
const MAXIMUM_PENDING_TAGS = 20;
const MAXIMUM_TAG_NAME_LENGTH = 100;
const unsafeTagName = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const matchKey = (name: string): string => name.trim().toLowerCase();

export const listCliTags = async (ctx: QueryCtx, userId: Id<"users">) => {
	const tags = await ctx.db
		.query("tags")
		.withIndex("by_userId", (q) => q.eq("userId", userId))
		.take(MAXIMUM_TAGS + 1);
	if (tags.length > MAXIMUM_TAGS) {
		throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
	}
	return tags;
};

export const planInlineTags = async (
	ctx: QueryCtx,
	userId: Id<"users">,
	names: readonly string[] | undefined
): Promise<string[]> => {
	if (!names?.length) {
		return [];
	}
	if (names.length > MAXIMUM_PENDING_TAGS) {
		throw new ConvexError("INVALID_TAG_NAME");
	}
	const normalized = names.map((raw) => {
		const name = raw.trim();
		if (
			!name ||
			[...name].length > MAXIMUM_TAG_NAME_LENGTH ||
			unsafeTagName.test(raw)
		) {
			throw new ConvexError("INVALID_TAG_NAME");
		}
		return name;
	});
	const existing = await listCliTags(ctx, userId);
	const usedNames = new Set(existing.map((tag) => matchKey(tag.name)));
	for (const name of normalized) {
		const key = matchKey(name);
		if (usedNames.has(key)) {
			throw new ConvexError("TAG_NAME_CONFLICT");
		}
		usedNames.add(key);
	}
	if (existing.length + normalized.length > MAXIMUM_TAGS) {
		throw new ConvexError("RESOURCE_LIMIT_EXCEEDED");
	}
	return normalized;
};

export const insertOwnedTag = async (
	ctx: MutationCtx,
	userId: Id<"users">,
	name: string
): Promise<Id<"tags">> =>
	await ctx.db.insert("tags", { createdAt: Date.now(), name, userId });
