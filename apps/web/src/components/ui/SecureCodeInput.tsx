import React, { useEffect, useRef } from "react";

interface SecureCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  masked?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  autoComplete?: "off" | "one-time-code";
  label?: string;
}

/** Reusable PIN/OTP input with paste, keyboard navigation, and completion callback. */
export const SecureCodeInput: React.FC<SecureCodeInputProps> = ({
  value,
  onChange,
  onComplete,
  length = 4,
  masked = true,
  error = false,
  autoFocus = false,
  autoComplete = "off",
  label = "Enter secure code",
}) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");
  const lastCompletedValue = useRef("");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const publish = (next: string) => {
    onChange(next);
    if (next.length === length && next !== lastCompletedValue.current) {
      lastCompletedValue.current = next;
      onComplete?.(next);
    }
    if (next.length < length) lastCompletedValue.current = "";
  };

  const handleInput = (index: number, raw: string) => {
    const entered = raw.replace(/\D/g, "").slice(0, length);
    const nextDigits = [...digits];

    if (entered.length > 1) {
      entered.split("").forEach((digit, offset) => {
        if (index + offset < length) nextDigits[index + offset] = digit;
      });
    } else {
      nextDigits[index] = entered;
    }

    const next = nextDigits.join("").slice(0, length);
    publish(next);
    const focusIndex = Math.min(index + Math.max(entered.length, 1), length - 1);
    if (entered) refs.current[focusIndex]?.focus();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    publish(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const nextDigits = [...digits];
      if (nextDigits[index]) nextDigits[index] = "";
      else if (index > 0) {
        nextDigits[index - 1] = "";
        refs.current[index - 1]?.focus();
      }
      publish(nextDigits.join(""));
    } else if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    else if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="flex gap-3 justify-center mt-1">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element; }}
          type={masked ? "password" : "text"}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={length}
          value={digit}
          onChange={(event) => handleInput(index, event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          autoComplete={autoComplete}
          aria-label={`${label}, digit ${index + 1} of ${length}`}
          className={`w-14 h-16 rounded-xl text-center text-2xl font-bold outline-none transition-all duration-150 cursor-text ${
            error ? "border-2 border-[#EF4444] bg-[#FEF2F2]" : digit ? "border-2 border-[#114B36] bg-[#EBF5F0]" : "border-2 border-[#D1D5DB] bg-white"
          } text-[#1F2937] focus:border-[#114B36] focus:ring-3 focus:ring-[rgba(17,75,54,0.1)]`}
        />
      ))}
    </div>
  );
};
