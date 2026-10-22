"use client";

import { useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/** A password input with a Show/Hide control, for react-hook-form's `{...field}`. */
export function PassphraseInput(props: Omit<React.ComponentProps<typeof InputGroupInput>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput
        {...props}
        type={show ? "text" : "password"}
        spellCheck={false}
        // Shown as plain text, a phone keyboard would capitalise and "correct" the passphrase.
        autoCapitalize="off"
        autoCorrect="off"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-label={show ? "Hide passphrase" : "Show passphrase"}
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
        >
          {show ? "Hide" : "Show"}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
