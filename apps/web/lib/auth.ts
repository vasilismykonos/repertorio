// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      // Πρώτο login: παίρνουμε provider / avatar από το Google profile
      if (account && profile) {
        (token as any).provider = account.provider;

        const picture =
          (profile as any).picture ??
          (profile as any).avatar_url ??
          (token as any).picture;

        if (picture) {
          (token as any).picture = picture;
        }

        // Προαιρετικά: αποθηκεύουμε name/email στο token για να τα περάσουμε στο session
        if ((profile as any).email) {
          token.email = (profile as any).email;
        }
        if ((profile as any).name) {
          token.name = (profile as any).name;
        }
      }

      return token;
    },

    async session({ session, token }) {
      // Περνάμε custom πεδία στο session.user
      if (session.user) {
        (session.user as any).provider = (token as any).provider ?? null;

        if ((token as any).picture) {
          session.user.image = (token as any).picture as string;
        }

        // Φροντίζουμε να υπάρχουν email/name στο session.user
        if (token.email) {
          session.user.email = token.email as string;
        }
        if (token.name) {
          session.user.name = token.name as string;
        }
      }

      return session;
    },
  },
};
