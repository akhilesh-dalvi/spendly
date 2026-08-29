/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountTypeHelpers from "../accountTypeHelpers.js";
import type * as accountTypeValidators from "../accountTypeValidators.js";
import type * as accountTypes from "../accountTypes.js";
import type * as accounts from "../accounts.js";
import type * as aggregations from "../aggregations.js";
import type * as categories from "../categories.js";
import type * as cycles from "../cycles.js";
import type * as expenses from "../expenses.js";
import type * as healthCheck from "../healthCheck.js";
import type * as helpers from "../helpers.js";
import type * as onboardingValidators from "../onboardingValidators.js";
import type * as tags from "../tags.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountTypeHelpers: typeof accountTypeHelpers;
  accountTypeValidators: typeof accountTypeValidators;
  accountTypes: typeof accountTypes;
  accounts: typeof accounts;
  aggregations: typeof aggregations;
  categories: typeof categories;
  cycles: typeof cycles;
  expenses: typeof expenses;
  healthCheck: typeof healthCheck;
  helpers: typeof helpers;
  onboardingValidators: typeof onboardingValidators;
  tags: typeof tags;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
