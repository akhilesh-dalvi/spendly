/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as accountTypeHelpers from "../accountTypeHelpers.js";
import type * as accountTypeValidators from "../accountTypeValidators.js";
import type * as accountTypes from "../accountTypes.js";
import type * as accounts from "../accounts.js";
import type * as aggregations from "../aggregations.js";
import type * as categories from "../categories.js";
import type * as cli_v1_accountTypes from "../cli/v1/accountTypes.js";
import type * as cli_v1_accounts from "../cli/v1/accounts.js";
import type * as cli_v1_auth from "../cli/v1/auth.js";
import type * as cli_v1_context from "../cli/v1/context.js";
import type * as cli_v1_cycles from "../cli/v1/cycles.js";
import type * as cli_v1_errors from "../cli/v1/errors.js";
import type * as cli_v1_expenses from "../cli/v1/expenses.js";
import type * as cli_v1_maintenance from "../cli/v1/maintenance.js";
import type * as cli_v1_presenters from "../cli/v1/presenters.js";
import type * as cli_v1_resources from "../cli/v1/resources.js";
import type * as cli_v1_validators from "../cli/v1/validators.js";
import type * as crons from "../crons.js";
import type * as cycles from "../cycles.js";
import type * as domain_accountOperations from "../domain/accountOperations.js";
import type * as domain_actionSource from "../domain/actionSource.js";
import type * as domain_cycleOperations from "../domain/cycleOperations.js";
import type * as domain_dates from "../domain/dates.js";
import type * as domain_expenseOperations from "../domain/expenseOperations.js";
import type * as domain_idempotency from "../domain/idempotency.js";
import type * as domain_revisions from "../domain/revisions.js";
import type * as expenses from "../expenses.js";
import type * as healthCheck from "../healthCheck.js";
import type * as helpers from "../helpers.js";
import type * as onboardingValidators from "../onboardingValidators.js";
import type * as tags from "../tags.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  accountTypeHelpers: typeof accountTypeHelpers;
  accountTypeValidators: typeof accountTypeValidators;
  accountTypes: typeof accountTypes;
  accounts: typeof accounts;
  aggregations: typeof aggregations;
  categories: typeof categories;
  "cli/v1/accountTypes": typeof cli_v1_accountTypes;
  "cli/v1/accounts": typeof cli_v1_accounts;
  "cli/v1/auth": typeof cli_v1_auth;
  "cli/v1/context": typeof cli_v1_context;
  "cli/v1/cycles": typeof cli_v1_cycles;
  "cli/v1/errors": typeof cli_v1_errors;
  "cli/v1/expenses": typeof cli_v1_expenses;
  "cli/v1/maintenance": typeof cli_v1_maintenance;
  "cli/v1/presenters": typeof cli_v1_presenters;
  "cli/v1/resources": typeof cli_v1_resources;
  "cli/v1/validators": typeof cli_v1_validators;
  crons: typeof crons;
  cycles: typeof cycles;
  "domain/accountOperations": typeof domain_accountOperations;
  "domain/actionSource": typeof domain_actionSource;
  "domain/cycleOperations": typeof domain_cycleOperations;
  "domain/dates": typeof domain_dates;
  "domain/expenseOperations": typeof domain_expenseOperations;
  "domain/idempotency": typeof domain_idempotency;
  "domain/revisions": typeof domain_revisions;
  expenses: typeof expenses;
  healthCheck: typeof healthCheck;
  helpers: typeof helpers;
  onboardingValidators: typeof onboardingValidators;
  tags: typeof tags;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
