import { ConvexError, v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { mutation, query } from "../../_generated/server";
import {
	executeIdempotentMutation,
	fingerprintRequest,
} from "../../domain/idempotency";
import { getCurrentUser } from "../../helpers";
import { supportedCurrencyValidator } from "../../onboardingValidators";
import { withCliErrors } from "./errors";

const editSnapshotPattern = /^[a-f0-9]{64}$/u;

const resultFields = {
	changed: v.boolean(),
	currency: supportedCurrencyValidator,
};

type Currency = typeof supportedCurrencyValidator.type;

const describeCurrentCurrency = (stored: string | undefined) => {
	if (stored === undefined || stored === "") {
		return { beforeCurrency: null, beforeStatus: "unset" as const };
	}
	for (const candidate of supportedCurrencyValidator.members) {
		if (stored === candidate.value) {
			return { beforeCurrency: candidate.value, beforeStatus: "set" as const };
		}
	}
	return { beforeCurrency: null, beforeStatus: "unsupported" as const };
};

const planCurrencyChange = async (user: Doc<"users">, currency: Currency) => ({
	...describeCurrentCurrency(user.currency),
	changed: user.currency !== currency,
	currency,
	editSnapshot: await fingerprintRequest({
		currency,
		operation: "settings.setCurrency",
		storedCurrency: user.currency ?? null,
		userId: user._id,
	}),
});

export const previewCurrency = query({
	args: { currency: supportedCurrencyValidator },
	handler: async (ctx, { currency }) =>
		await withCliErrors(async () =>
			planCurrencyChange(await getCurrentUser(ctx), currency)
		),
	returns: v.object({
		...resultFields,
		beforeCurrency: v.union(supportedCurrencyValidator, v.null()),
		beforeStatus: v.union(
			v.literal("set"),
			v.literal("unset"),
			v.literal("unsupported")
		),
		editSnapshot: v.string(),
	}),
});

export const setCurrency = mutation({
	args: {
		agent: v.optional(v.boolean()),
		currency: supportedCurrencyValidator,
		expectedEditSnapshot: v.string(),
		idempotencyKey: v.string(),
	},
	handler: async (ctx, { idempotencyKey, ...request }) =>
		await withCliErrors(async () => {
			const user = await getCurrentUser(ctx);
			if (!editSnapshotPattern.test(request.expectedEditSnapshot)) {
				throw new ConvexError("INVALID_INPUT");
			}
			return await executeIdempotentMutation(ctx, {
				execute: async () => {
					const { changed, currency, editSnapshot } = await planCurrencyChange(
						user,
						request.currency
					);
					if (editSnapshot !== request.expectedEditSnapshot) {
						throw new ConvexError("PREFERRED_CURRENCY_CONFLICT");
					}
					if (changed) {
						await ctx.db.patch(user._id, { currency });
					}
					return { changed, currency };
				},
				key: idempotencyKey,
				operation: "settings.setCurrency",
				request,
				userId: user._id,
			});
		}),
	returns: v.object(resultFields),
});
