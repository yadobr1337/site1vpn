import { Role } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: Role;
      balanceKopeks: number;
      telegramId?: string | null;
      subscriptionUrl?: string | null;
      publicId?: string | null;
      isEmailPlaceholder: boolean;
      emailVerified?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    balanceKopeks?: number;
    telegramId?: string | null;
    subscriptionUrl?: string | null;
    publicId?: string | null;
    isEmailPlaceholder?: boolean;
    emailVerified?: string | null;
  }
}
