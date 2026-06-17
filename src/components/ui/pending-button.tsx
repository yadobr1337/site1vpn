"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export function PendingButton(props: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} disabled={pending || props.disabled}>
      {pending ? "Подождите..." : props.children}
    </Button>
  );
}
