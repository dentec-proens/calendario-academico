import { assertWritesOpen } from './lib/maintenance';
import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { internal } from './_generated/api';
import { initializeSession } from './access/store';
import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';
import { passwordCrypto, validatePassword } from './authCrypto';
import { institutionalEmail, memberFromRow, assertUserSession } from './access/identity';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { GenericDataModel } from 'convex/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ConvexCredentials<GenericDataModel>({
      id: 'password',
      crypto: passwordCrypto,
      async authorize(params, ctx) {
        // The application supports sign-in only; provisioning/reset remain in
        // the separately authorized application flows.
        if (params.flow !== 'signIn') throw Error('Solicite seu acesso à administração.');
        validatePassword(params.password);
        const result = await ctx.runMutation(internal.access.passwordSignIn.authorize, {
          email: institutionalEmail(params.email),
          password: params.password,
        });
        if ('error' in result) throw Error(result.error);
        return result;
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            profile(profile) {
              if (profile.email_verified !== true) throw Error('E-mail Google não verificado.');
              return {
                id: profile.sub,
                googleSubject: profile.sub,
                name: profile.name,
                email: institutionalEmail(profile.email),
                image: profile.picture,
              };
            },
          }),
        ]
      : []),
  ],
  session: { totalDurationMs: 8 * 60 * 60 * 1000, inactiveDurationMs: 8 * 60 * 60 * 1000 },
  jwt: {
    async customClaims(ctx, { userId, sessionId }) {
      await assertUserSession(
        ctx as MutationCtx,
        userId as Id<'users'>,
        sessionId as Id<'authSessions'>,
      );
      return {};
    },
  },
  callbacks: {
    async afterSessionCreation(ctx, { userId, sessionId }) {
      await initializeSession(
        ctx as MutationCtx,
        userId as Id<'users'>,
        sessionId as Id<'authSessions'>,
      );
    },
    async createOrUpdateUser(ctx, args) {
      const db = (ctx as MutationCtx).db;
      const email = institutionalEmail(args.profile.email);
      const row = args.existingUserId
        ? await db.get(args.existingUserId)
        : await db
            .query('users')
            .withIndex('email', (q) => q.eq('email', email))
            .unique();
      const member = memberFromRow(row);
      if (!row || !member || member.email !== email)
        throw Error('Solicite seu acesso à administração.');
      await assertWritesOpen(ctx as MutationCtx);
      if (args.provider.id === 'google') {
        const subject = args.profile.googleSubject;
        if (
          typeof subject !== 'string' ||
          !subject ||
          (member.googleSubject && member.googleSubject !== subject)
        )
          throw Error('Conta Google incompatível com o acesso cadastrado.');
        await db.patch(row._id, { googleSubject: subject, googleLastLoginAt: Date.now() });
      }
      return row._id;
    },
    async beforeSessionCreation(ctx, { userId }) {
      await assertWritesOpen(ctx as MutationCtx);
      if (!memberFromRow(await ctx.db.get(userId)))
        throw Error('Solicite seu acesso à administração.');
    },
  },
});
