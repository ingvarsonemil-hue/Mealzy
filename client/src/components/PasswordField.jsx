import * as React from 'react';
import { Label, Input } from '@/components/ui/field';
import { Eye, EyeOff, Check } from '@/components/icons';
import { PW_RULES } from '@/lib/auth';
import { cn } from '@/lib/utils';

/* Password input with show/hide toggle and (optionally) the live requirement
 * checklist used on sign-up and reset — same rules the legacy pages enforced. */
export default function PasswordField({
  id,
  label = 'Password',
  value,
  onChange,
  placeholder,
  autoComplete,
  checklist = false,
  onFocus,
  ...props
}) {
  const [visible, setVisible] = React.useState(false);
  const [showChecklist, setShowChecklist] = React.useState(false);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <span className="relative block">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="pr-11"
          aria-describedby={checklist ? `${id}-checklist` : undefined}
          onFocus={(e) => {
            setShowChecklist(true);
            if (onFocus) onFocus(e);
          }}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-controls={id}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-fg transition-colors duration-150 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green"
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </span>
      {checklist && (
        <>
          <p className="mt-2 text-[13px] leading-normal text-muted-fg">
            12+ characters, with at least 3 of: uppercase, lowercase, numbers, special characters.
          </p>
          {showChecklist && (
            <ul id={`${id}-checklist`} aria-label="Password requirements" aria-live="polite" className="mt-2 flex flex-col gap-1">
              {PW_RULES.map((rule) => {
                const met = rule.test(value);
                return (
                  <li key={rule.id} className={cn('flex items-center gap-2 text-[13px]', met ? 'text-green-deep dark:text-green-light' : 'text-muted-fg')}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-full border',
                        met ? 'border-green bg-green text-white' : 'border-border-warm bg-transparent'
                      )}
                    >
                      {met && <Check width="10" height="10" />}
                    </span>
                    {rule.label}
                    <span className="sr-only">{met ? ' — met' : ' — not met'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
