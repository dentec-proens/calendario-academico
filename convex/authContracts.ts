import { v } from 'convex/values';
import type { Infer } from 'convex/values';

export const memberRole = v.union(v.literal('ADMIN'), v.literal('CAMPUS'));
export const loginMethod = v.union(v.literal('local'), v.literal('google'), v.literal('invite'));
export const publicMember = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  role: memberRole,
  campusId: v.union(v.string(), v.null()),
  active: v.boolean(),
  inviteExpiresAt: v.union(v.number(), v.null()),
  loginMethod,
});

export const invitationResult = {
  inviteUrl: v.string(),
  inviteExpiresAt: v.number(),
};
export const createdMember = v.object({
  ...publicMember.fields,
  inviteUrl: v.optional(v.string()),
});
export const memberInput = v.object({
  name: v.string(),
  email: v.string(),
  role: v.optional(memberRole),
  campusId: v.optional(v.union(v.string(), v.null())),
  loginMethod: v.optional(loginMethod),
});
export const memberCredentialsInput = v.object({
  ...memberInput.fields,
  password: v.optional(v.string()),
});
export const setupInput = v.object({
  name: v.string(),
  email: v.string(),
  password: v.string(),
  code: v.string(),
});

export type PublicMember = Infer<typeof publicMember>;
export type CreatedMember = Infer<typeof createdMember>;
export type Member = Omit<PublicMember, 'campusId' | 'loginMethod' | 'inviteExpiresAt'> & {
  campusId?: string | null;
  loginMethod?: Infer<typeof loginMethod>;
  inviteExpiresAt?: number;
  removedAt?: string;
  nativeInviteHash?: string;
  nativeResetHash?: string;
  googleSubject?: string;
  googleLastLoginAt?: string;
  hash?: string;
  salt?: string;
};
