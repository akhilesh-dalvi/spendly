import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const DELETION_CONFIRMATION_LIFETIME_MS = 5 * 60 * 1000;
const MINIMUM_IDEMPOTENCY_KEY_LENGTH = 8;
const MAXIMUM_IDEMPOTENCY_KEY_LENGTH = 200;

const canonicalize = (value: unknown): unknown => {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new ConvexError("INVALID_IDEMPOTENCY_REQUEST");
		}
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	if (typeof value === "object") {
		const canonical: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value).sort(([left], [right]) =>
			left.localeCompare(right)
		)) {
			if (child !== undefined) {
				canonical[key] = canonicalize(child);
			}
		}
		return canonical;
	}
	throw new ConvexError("INVALID_IDEMPOTENCY_REQUEST");
};

export const fingerprintRequest = async (request: unknown): Promise<string> => {
	const serialized = JSON.stringify(canonicalize(request));
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(serialized)
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("");
};

const validateIdempotencyKey = (key: string): string => {
	const normalizedKey = key.trim();
	if (
		normalizedKey.length < MINIMUM_IDEMPOTENCY_KEY_LENGTH ||
		normalizedKey.length > MAXIMUM_IDEMPOTENCY_KEY_LENGTH
	) {
		throw new ConvexError("INVALID_IDEMPOTENCY_KEY");
	}
	return normalizedKey;
};

export const executeIdempotentMutation = async <Result>(
	ctx: MutationCtx,
	options: {
		userId: Id<"users">;
		key: string;
		operation: string;
		request: unknown;
		execute: () => Promise<Result>;
		now?: number;
	}
): Promise<Result> => {
	const key = validateIdempotencyKey(options.key);
	const now = options.now ?? Date.now();
	const requestFingerprint = await fingerprintRequest({
		operation: options.operation,
		request: options.request,
	});
	const existing = await ctx.db
		.query("cli_idempotency")
		.withIndex("by_userId_key", (queryBuilder) =>
			queryBuilder.eq("userId", options.userId).eq("key", key)
		)
		.unique();

	if (existing && existing.expiresAt > now) {
		if (
			existing.operation !== options.operation ||
			existing.requestFingerprint !== requestFingerprint
		) {
			throw new ConvexError("IDEMPOTENCY_CONFLICT");
		}
		return existing.result as Result;
	}
	if (existing) {
		await ctx.db.delete(existing._id);
	}

	const result = await options.execute();
	await ctx.db.insert("cli_idempotency", {
		createdAt: now,
		expiresAt: now + IDEMPOTENCY_RETENTION_MS,
		key,
		operation: options.operation,
		requestFingerprint,
		result,
		userId: options.userId,
	});
	return result;
};
