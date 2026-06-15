import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ensureUserSquad } from "@/lib/squads";
import { sendTelegramMessage, verifyTelegramAuth, verifyTelegramMiniAppAuth } from "@/lib/telegram";
import { ensureUserPublicId } from "@/lib/user-identity";

async function getSessionUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return null;
  }

  const publicId = await ensureUserPublicId(user.id);

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    balanceKopeks: user.balanceKopeks,
    telegramId: user.telegramId,
    subscriptionUrl: user.subscriptionUrl,
    publicId,
    isEmailPlaceholder: user.isEmailPlaceholder,
    emailVerified: user.emailVerified?.toISOString() ?? null,
  };
}

async function upsertTelegramUser(params: {
  id: string;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
}) {
  const placeholderEmail = `telegram-${params.id}@1vpn.local`;

  return db.$transaction(
    async (tx) => {
      const existing = await tx.user.findFirst({
        where: {
          OR: [{ telegramId: params.id }, { email: placeholderEmail }],
        },
      });

      const linkedNow = !existing?.telegramId;

      const persisted = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              telegramId: params.id,
              telegramFirstName: params.firstName,
              telegramUsername: params.username,
              telegramPhotoUrl: params.photoUrl,
              email: existing.isEmailPlaceholder ? placeholderEmail : existing.email,
              isEmailPlaceholder: existing.isEmailPlaceholder,
            },
          })
        : await tx.user.create({
            data: {
              email: placeholderEmail,
              role: Role.USER,
              telegramId: params.id,
              telegramFirstName: params.firstName,
              telegramUsername: params.username,
              telegramPhotoUrl: params.photoUrl,
              isEmailPlaceholder: true,
            },
          });

      await ensureUserSquad(persisted.id, tx);
      return { persisted, linkedNow };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error("Email and password are required.");
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user?.passwordHash || user.isEmailPlaceholder) {
          throw new Error("Account not found.");
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error("Invalid password.");
        }

        return getSessionUser(user.id);
      },
    }),
    CredentialsProvider({
      id: "telegram",
      name: "Telegram",
      credentials: {
        id: { label: "Telegram ID", type: "text" },
        first_name: { label: "First name", type: "text" },
        username: { label: "Username", type: "text" },
        photo_url: { label: "Photo URL", type: "text" },
        auth_date: { label: "Auth date", type: "text" },
        hash: { label: "Hash", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials) {
          throw new Error("Telegram payload is missing.");
        }

        const verification = await verifyTelegramAuth({
          id: credentials.id,
          first_name: credentials.first_name,
          username: credentials.username,
          photo_url: credentials.photo_url,
          auth_date: credentials.auth_date,
          hash: credentials.hash,
        });

        if (!verification.ok) {
          throw new Error(verification.error);
        }

        const { persisted, linkedNow } = await upsertTelegramUser(verification.data);
        if (linkedNow) {
          await sendTelegramMessage(
            verification.data.id,
            "<b>1VPN</b>\nTelegram подключен. Уведомления о балансе и подписке включены.",
          );
        }
        return getSessionUser(persisted.id);
      },
    }),
    CredentialsProvider({
      id: "telegram-mini",
      name: "Telegram Mini App",
      credentials: {
        initData: { label: "Mini app initData", type: "text" },
      },
      async authorize(credentials) {
        const initData = credentials?.initData;
        if (!initData) {
          throw new Error("Telegram Mini App payload is missing.");
        }

        const verification = await verifyTelegramMiniAppAuth(initData);
        if (!verification.ok) {
          throw new Error(verification.error);
        }

        const { persisted, linkedNow } = await upsertTelegramUser(verification.data);
        if (linkedNow) {
          await sendTelegramMessage(
            verification.data.id,
            "<b>1VPN</b>\nTelegram подключен. Уведомления о балансе и подписке включены.",
          );
        }
        return getSessionUser(persisted.id);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      const userId = token.id ?? token.sub;
      if (!userId) {
        return token;
      }

      const freshUser = await getSessionUser(String(userId));
      if (!freshUser) {
        return token;
      }

      token.role = freshUser.role;
      token.balanceKopeks = freshUser.balanceKopeks;
      token.telegramId = freshUser.telegramId;
      token.subscriptionUrl = freshUser.subscriptionUrl;
      token.publicId = freshUser.publicId;
      token.isEmailPlaceholder = freshUser.isEmailPlaceholder;
      token.emailVerified = freshUser.emailVerified;
      token.email = freshUser.email;

      return token;
    },
    async session({ session, token }) {
      if (!session.user) {
        return session;
      }

      session.user.id = String(token.id ?? token.sub ?? "");
      session.user.role = token.role ?? Role.USER;
      session.user.balanceKopeks = token.balanceKopeks ?? 0;
      session.user.telegramId = token.telegramId;
      session.user.subscriptionUrl = token.subscriptionUrl;
      session.user.publicId = token.publicId;
      session.user.isEmailPlaceholder = token.isEmailPlaceholder ?? false;
      session.user.emailVerified = token.emailVerified ?? null;
      session.user.email = String(token.email ?? session.user.email ?? "");

      return session;
    },
  },
};

export async function getAuthSession() {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== Role.ADMIN) {
    redirect("/dashboard");
  }
  return session;
}
