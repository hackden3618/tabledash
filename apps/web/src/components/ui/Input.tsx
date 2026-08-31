import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  icon,
  className = "",
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const valueStr = String((props.value ?? "") as any);
  const hasValue = focused || valueStr.length > 0;

  return (
    <div className="w-full">
      <div
        className={`
          relative flex items-center rounded-xl border-2 bg-white
          transition-all duration-200
          ${focused ? "border-[#114B36] ring-3 ring-[rgba(17,75,54,0.1)]" : "border-[#E5E7EB]"}
          ${error ? "border-[#EF4444] ring-3 ring-[rgba(239,68,68,0.1)]" : ""}
        `}
      >
        {label && (
          <label className={`absolute left-4 pointer-events-none transition-all duration-150 ${hasValue ? "-translate-y-5 text-xs text-[#114B36] font-semibold" : "translate-y-0 text-sm text-[#374151]"}`}>
            {label}
          </label>
        )}
        {icon && (
          <span className="pl-4 text-[#9CA3AF] flex-shrink-0">{icon}</span>
        )}
        <input
          className={`
            w-full bg-transparent px-4 ${label ? "pt-6 pb-3" : "py-3.5"} text-base text-[#1F2937]
            placeholder:text-[#9CA3AF] outline-none
            ${icon ? "pl-3" : ""}
            ${className}
          `}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          {...props}
        />
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs font-semibold text-[#EF4444] mt-1.5 flex items-center gap-1"
          >
            <span>⚠</span> {error}
          </motion.p>
        )}
      </AnimatePresence>
      {hint && !error && (
        <p className="text-xs text-[#9CA3AF] mt-1">{hint}</p>
      )}
    </div>
  );
};

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  hint,
  className = "",
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const valueStr = String((props.value ?? "") as any);
  const hasValue = focused || valueStr.length > 0;

  return (
    <div className="w-full">
      <div
        className={`
          relative rounded-xl border-2 bg-white transition-all duration-200
          ${focused ? "border-[#114B36] ring-3 ring-[rgba(17,75,54,0.1)]" : "border-[#E5E7EB]"}
          ${error ? "border-[#EF4444] ring-3 ring-[rgba(239,68,68,0.1)]" : ""}
        `}
      >
        {label && (
          <label className={`absolute left-4 pointer-events-none transition-all duration-150 ${hasValue ? "-translate-y-5 text-xs text-[#114B36] font-semibold" : "translate-y-0 text-sm text-[#374151]"}`}>
            {label}
          </label>
        )}
        <textarea
          className={`
            w-full bg-transparent px-4 ${label ? "pt-6 pb-3" : "py-3.5"} text-base text-[#1F2937]
            placeholder:text-[#9CA3AF] outline-none resize-none
            ${className}
          `}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          {...props}
        />
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs font-semibold text-[#EF4444] mt-1.5 flex items-center gap-1"
          >
            <span>⚠</span> {error}
          </motion.p>
        )}
      </AnimatePresence>
      {hint && !error && (
        <p className="text-xs text-[#9CA3AF] mt-1">{hint}</p>
      )}
    </div>
  );
};
