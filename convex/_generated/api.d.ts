/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access_admission from "../access/admission.js";
import type * as access_cleanup from "../access/cleanup.js";
import type * as access_contracts from "../access/contracts.js";
import type * as access_identity from "../access/identity.js";
import type * as access_invitations from "../access/invitations.js";
import type * as access_members from "../access/members.js";
import type * as access_passwordRecovery from "../access/passwordRecovery.js";
import type * as access_passwordSignIn from "../access/passwordSignIn.js";
import type * as access_security from "../access/security.js";
import type * as access_session from "../access/session.js";
import type * as access_setup from "../access/setup.js";
import type * as access_store from "../access/store.js";
import type * as actions_documents from "../actions/documents.js";
import type * as actions_files from "../actions/files.js";
import type * as actions_pdf from "../actions/pdf.js";
import type * as actions_uploads from "../actions/uploads.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as authCrypto from "../authCrypto.js";
import type * as calendars from "../calendars.js";
import type * as calendars_authorship from "../calendars/authorship.js";
import type * as calendars_base from "../calendars/base.js";
import type * as calendars_model from "../calendars/model.js";
import type * as calendars_record from "../calendars/record.js";
import type * as campuses from "../campuses.js";
import type * as catalogue from "../catalogue.js";
import type * as catalogue_model from "../catalogue/model.js";
import type * as contracts from "../contracts.js";
import type * as crons from "../crons.js";
import type * as devSetup from "../devSetup.js";
import type * as documents from "../documents.js";
import type * as documents_model from "../documents/model.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as lib_maintenance from "../lib/maintenance.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_shared from "../lib/shared.js";
import type * as lib_uploads from "../lib/uploads.js";
import type * as nativeFiles from "../nativeFiles.js";
import type * as operations from "../operations.js";
import type * as presence from "../presence.js";
import type * as releases from "../releases.js";
import type * as releases_contract from "../releases/contract.js";
import type * as releases_plan from "../releases/plan.js";
import type * as reviews from "../reviews.js";
import type * as reviews_model from "../reviews/model.js";
import type * as runtimeArtifacts from "../runtimeArtifacts.js";
import type * as validators from "../validators.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "access/admission": typeof access_admission;
  "access/cleanup": typeof access_cleanup;
  "access/contracts": typeof access_contracts;
  "access/identity": typeof access_identity;
  "access/invitations": typeof access_invitations;
  "access/members": typeof access_members;
  "access/passwordRecovery": typeof access_passwordRecovery;
  "access/passwordSignIn": typeof access_passwordSignIn;
  "access/security": typeof access_security;
  "access/session": typeof access_session;
  "access/setup": typeof access_setup;
  "access/store": typeof access_store;
  "actions/documents": typeof actions_documents;
  "actions/files": typeof actions_files;
  "actions/pdf": typeof actions_pdf;
  "actions/uploads": typeof actions_uploads;
  audit: typeof audit;
  auth: typeof auth;
  authCrypto: typeof authCrypto;
  calendars: typeof calendars;
  "calendars/authorship": typeof calendars_authorship;
  "calendars/base": typeof calendars_base;
  "calendars/model": typeof calendars_model;
  "calendars/record": typeof calendars_record;
  campuses: typeof campuses;
  catalogue: typeof catalogue;
  "catalogue/model": typeof catalogue_model;
  contracts: typeof contracts;
  crons: typeof crons;
  devSetup: typeof devSetup;
  documents: typeof documents;
  "documents/model": typeof documents_model;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/authorization": typeof lib_authorization;
  "lib/maintenance": typeof lib_maintenance;
  "lib/pagination": typeof lib_pagination;
  "lib/shared": typeof lib_shared;
  "lib/uploads": typeof lib_uploads;
  nativeFiles: typeof nativeFiles;
  operations: typeof operations;
  presence: typeof presence;
  releases: typeof releases;
  "releases/contract": typeof releases_contract;
  "releases/plan": typeof releases_plan;
  reviews: typeof reviews;
  "reviews/model": typeof reviews_model;
  runtimeArtifacts: typeof runtimeArtifacts;
  validators: typeof validators;
  workspace: typeof workspace;
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

export declare const components: {
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
