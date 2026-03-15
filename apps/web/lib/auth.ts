import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async signIn({ user }) {
      try {
        console.log("[auth.signIn] start", {
          email: user?.email ?? null,
          name: user?.name ?? null,
        });

        if (!user?.email) {
          console.log("[auth.signIn] missing email");
          return false;
        }

        const base =
          process.env.API_INTERNAL_BASE_URL ||
          process.env.NEXT_PUBLIC_API_URL;

        console.log("[auth.signIn] base", base ?? null);

        if (!base) {
          console.error("[auth.signIn] Missing API base URL");
          return false;
        }

        const url = `${base}/users/register-from-auth`;
        console.log("[auth.signIn] POST", url);

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
            name: user.name ?? null,
            image: user.image ?? null,
          }),
          cache: "no-store",
        });

        const text = await res.text().catch(() => "");

        console.log("[auth.signIn] response", {
          status: res.status,
          ok: res.ok,
          body: text,
        });

        if (!res.ok) {
          return false;
        }

        return true;
      } catch (e) {
        console.error("[auth.signIn] exception", e);
        return false;
      }
    },

    async jwt({ token, account, profile }) {
      if (account && profile) {
        (token as any).provider = account.provider;

        const picture =
          (profile as any).picture ??
          (profile as any).avatar_url ??
          (token as any).picture;

        if (picture) {
          (token as any).picture = picture;
        }

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
      if (session.user) {
        (session.user as any).provider = (token as any).provider ?? null;

        if ((token as any).picture) {
          session.user.image = (token as any).picture as string;
        }

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