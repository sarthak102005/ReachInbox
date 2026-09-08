'use client';

import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftAddon, rightAddon, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-secondary"
          >
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-3 text-text-muted pointer-events-none">
              {leftAddon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            {...props}
            className={`
              w-full h-9 bg-elevated border rounded-lg px-3 text-sm text-text-primary
              placeholder:text-text-muted transition-all duration-150
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? 'border-error/50 focus:ring-error/30' : 'border-white/10 hover:border-white/20'}
              ${leftAddon ? 'pl-9' : ''}
              ${rightAddon ? 'pr-9' : ''}
              ${className}
            `}
          />

          {rightAddon && (
            <div className="absolute right-3 text-text-muted">
              {rightAddon}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-error">{error}</p>}
        {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';

// ─── Textarea ─────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-text-secondary"
          >
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          {...props}
          className={`
            w-full bg-elevated border rounded-lg px-3 py-2.5 text-sm text-text-primary
            placeholder:text-text-muted resize-none transition-all duration-150
            focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-error/50 focus:ring-error/30' : 'border-white/10 hover:border-white/20'}
            ${className}
          `}
        />

        {error && <p className="text-xs text-error">{error}</p>}
        {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
