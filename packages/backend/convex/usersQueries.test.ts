// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("web user queries and preferences", () => {
	it("creates users once and persists currency, dashboard, and onboarding preferences", async () => {
		const test = convexTest(schema, modules);
		const owner = test.withIdentity({ subject: "user-preferences" });
		const userId = await owner.mutation(api.users.create, {
			email: "owner@example.com",
			name: "Owner",
		});
		expect(
			await owner.mutation(api.users.create, {
				email: "replacement@example.com",
			})
		).toBe(userId);
		expect(await owner.query(api.users.get, {})).toMatchObject({
			_id: userId,
			currency: "USD",
			email: "owner@example.com",
			name: "Owner",
		});
		expect(
			await owner.mutation(api.users.updateCurrency, { currency: "EUR" })
		).toMatchObject({ currency: "EUR" });
		expect(
			await owner.mutation(api.users.updateDashboardViewMode, {
				viewMode: "accounts",
			})
		).toMatchObject({ currency: "EUR", dashboardViewMode: "accounts" });
		expect(await owner.mutation(api.users.dismissAccountsOnboarding, {})).toBe(
			"skipped"
		);
		expect(await owner.query(api.users.getOnboardingState, {})).toMatchObject({
			accountStatus: "skipped",
			currency: "EUR",
			cycle: null,
			path: null,
			step: "start",
		});
	});

	it("requires authentication and an existing backend user to change preferences", async () => {
		const test = convexTest(schema, modules);
		const unregistered = test.withIdentity({ subject: "not-registered" });
		await expect(
			test.mutation(api.users.create, { email: "owner@example.com" })
		).rejects.toThrow("without authentication");
		await expect(
			test.mutation(api.users.updateCurrency, { currency: "EUR" })
		).rejects.toThrow("without authentication");
		await expect(
			test.mutation(api.users.updateDashboardViewMode, { viewMode: "accounts" })
		).rejects.toThrow("without authentication");
		await expect(
			unregistered.mutation(api.users.updateCurrency, { currency: "EUR" })
		).rejects.toThrow("User not found");
		await expect(
			unregistered.mutation(api.users.updateDashboardViewMode, {
				viewMode: "accounts",
			})
		).rejects.toThrow("User not found");
		expect(await test.query(api.users.getOnboardingState, {})).toBeNull();
		expect(
			await unregistered.query(api.users.getOnboardingState, {})
		).toBeNull();
	});

	it("requires a cycle before advancing and uses the free onboarding path", async () => {
		const test = convexTest(schema, modules);
		const owner = test.withIdentity({ subject: "free-path" });
		await owner.mutation(api.users.create, { email: "owner@example.com" });
		await expect(
			owner.mutation(api.users.advanceOnboarding, { step: "account" })
		).rejects.toThrow("before continuing");
		await expect(
			owner.mutation(api.users.completeOnboarding, { accountStatus: "skipped" })
		).rejects.toThrow("before completing onboarding");
		await owner.mutation(api.users.beginOnboarding, {
			currency: "USD",
			path: "free",
		});
		const cycleId = await owner.mutation(api.cycles.saveOnboardingCycle, {
			endDate: "2026-02-01",
			name: "January",
			startDate: "2026-01-01",
		});
		expect(await owner.query(api.users.getOnboardingState, {})).toMatchObject({
			cycle: { _id: cycleId },
			path: "free",
			step: "account",
		});
		await owner.mutation(api.users.advanceOnboarding, { step: "account" });
		await owner.mutation(api.users.completeOnboarding, {
			accountStatus: "skipped",
		});
		expect(await owner.query(api.users.getOnboardingState, {})).toMatchObject({
			accountStatus: "skipped",
			step: "complete",
		});
	});

	it("infers legacy onboarding completion only when a user has an existing cycle", async () => {
		const test = convexTest(schema, modules);
		const owner = test.withIdentity({ subject: "legacy-state" });
		await test.run(
			async (ctx) =>
				await ctx.db.insert("users", {
					clerkId: "legacy-state",
					createdAt: 0,
					email: "legacy@example.com",
				})
		);
		expect(await owner.query(api.users.getOnboardingState, {})).toEqual({
			accountStatus: "completed",
			currency: "USD",
			cycle: null,
			path: null,
			step: "start",
		});
		const cycle = await owner.mutation(api.cycles.create, {
			endDate: "2026-02-01",
			name: "January",
			startDate: "2026-01-01",
		});
		expect(await owner.query(api.users.getOnboardingState, {})).toEqual({
			accountStatus: "completed",
			currency: "USD",
			cycle: null,
			path: null,
			step: "complete",
		});
		expect(
			await owner.query(api.cycles.get, { cycleId: cycle._id })
		).toMatchObject({ name: "January" });
		expect(
			await owner.query(api.cycles.getCurrent, { date: "2026-01-31" })
		).toMatchObject({ _id: cycle._id });
		expect(
			await owner.query(api.cycles.getCurrent, { date: "2026-02-01" })
		).toBeNull();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
		try {
			expect(await owner.query(api.cycles.getCurrent, {})).toMatchObject({
				_id: cycle._id,
			});
			expect(
				await owner.query(api.cycles.getCurrent, { date: "" })
			).toMatchObject({ _id: cycle._id });
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not expose a foreign or deleted onboarding cycle in legacy state", async () => {
		const test = convexTest(schema, modules);
		const owner = test.withIdentity({ subject: "legacy-path" });
		const other = test.withIdentity({ subject: "foreign-cycle" });
		const userId = await test.run(
			async (ctx) =>
				await ctx.db.insert("users", {
					clerkId: "legacy-path",
					createdAt: 0,
					email: "legacy@example.com",
					onboardingPath: "plan",
				})
		);
		await other.mutation(api.users.create, { email: "other@example.com" });
		const cycle = await other.mutation(api.cycles.create, {
			endDate: "2026-02-01",
			name: "Private",
			startDate: "2026-01-01",
		});
		await test.run(
			async (ctx) =>
				await ctx.db.patch(userId, { onboardingCycleId: cycle._id })
		);
		expect(await owner.query(api.users.getOnboardingState, {})).toEqual({
			accountStatus: "pending",
			currency: "USD",
			cycle: null,
			path: "plan",
			step: "start",
		});
		await other.mutation(api.cycles.remove, { id: cycle._id });
		expect(await owner.query(api.users.getOnboardingState, {})).toMatchObject({
			cycle: null,
		});
	});
});
