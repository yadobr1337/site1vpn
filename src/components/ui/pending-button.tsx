"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export function PendingButton(props: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending || props.disabled} {...props}>
      {pending ? "Подождите..." : props.children}
    </Button>
  );
}
