/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as authContracts from "../authContracts.js";
import type * as authCrypto from "../authCrypto.js";
import type * as http from "../http.js";
import type * as model from "../model.js";
import type * as native from "../native.js";
import type * as nativeActions from "../nativeActions.js";
import type * as nativeAuth from "../nativeAuth.js";
import type * as nativeFiles from "../nativeFiles.js";
import type * as store from "../store.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  authContracts: typeof authContracts;
  authCrypto: typeof authCrypto;
  http: typeof http;
  model: typeof model;
  native: typeof native;
  nativeActions: typeof nativeActions;
  nativeAuth: typeof nativeAuth;
  nativeFiles: typeof nativeFiles;
  store: typeof store;
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
