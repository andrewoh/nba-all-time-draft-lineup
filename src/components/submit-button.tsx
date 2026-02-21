'use client';

import { useFormStatus } from 'react-dom';

type SubmitButtonProps = {
  label: string;
  pendingLabel?: string;
  className?: string;
  testId?: string;
};

export function SubmitButton({
  label,
  pendingLabel = 'Saving...',
  className,
  testId
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className ?? 'button-primary'}
      disabled={pending}
      data-testid={testId}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
