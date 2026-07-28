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

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-[#374151] mb-1.5">
          {label}
        </label>
      )}
      <div
        className={`
          relative flex items-center rounded-xl border-2 bg-white
          transition-all duration-200
          ${focused ? "border-[#114B36] ring-3 ring-[rgba(17,75,54,0.1)]" : "border-[#E5E7EB]"}
          ${error ? "border-[#EF4444] ring-3 ring-[rgba(239,68,68,0.1)]" : ""}
        `}
      >
        {icon && (
          <span className="pl-4 text-[#9CA3AF] flex-shrink-0">{icon}</span>
        )}
        <input
          className={`
            w-full bg-transparent px-4 py-3.5 text-base text-[#1F2937]
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

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-[#374151] mb-1.5">
          {label}
        </label>
      )}
      <div
        className={`
          relative rounded-xl border-2 bg-white transition-all duration-200
          ${focused ? "border-[#114B36] ring-3 ring-[rgba(17,75,54,0.1)]" : "border-[#E5E7EB]"}
          ${error ? "border-[#EF4444] ring-3 ring-[rgba(239,68,68,0.1)]" : ""}
        `}
      >
        <textarea
          className={`
            w-full bg-transparent px-4 py-3.5 text-base text-[#1F2937]
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
