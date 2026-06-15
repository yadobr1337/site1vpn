"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await signOut({ redirect: false });
        window.location.href = "/";
      }}
      type="button"
    >
      Выйти
    </Button>
  );
}
