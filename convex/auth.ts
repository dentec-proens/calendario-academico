import { Password } from '@convex-dev/auth/providers/Password';
import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';
import { passwordCrypto, validatePassword } from './authCrypto';
import { institutionalEmail, memberFromRow } from './nativeAuth';
import { encodeValue } from '../src/convex-codec.mjs';
import type { MutationCtx } from './_generated/server';
import type { GenericDataModel } from 'convex/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<GenericDataModel>({
      crypto: passwordCrypto,
      validatePasswordRequirements: validatePassword,
      profile(params) {
        // Accounts are provisioned by administrators, approved invitations or
        // the one-time installation flow, never by arbitrary public sign-up.
        if (params.flow !== 'signIn') throw Error('Solicite seu acesso à administração.');
        validatePassword(params.password);
        return { email: institutionalEmail(params.email) };
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
  callbacks: {
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
      if (args.provider.id === 'google') {
        const subject = args.profile.googleSubject;
        if (
          typeof subject !== 'string' ||
          !subject ||
          (member.googleSubject && member.googleSubject !== subject)
        )
          throw Error('Conta Google incompatível com o acesso cadastrado.');
        member.googleSubject = subject;
        member.googleLastLoginAt = new Date().toISOString();
        await db.patch(row._id, { value: encodeValue(member) });
      }
      return row._id;
    },
    async beforeSessionCreation(ctx, { userId }) {
      if (!memberFromRow(await ctx.db.get(userId)))
        throw Error('Solicite seu acesso à administração.');
    },
  },
});
