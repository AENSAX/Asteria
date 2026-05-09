import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';

type FeedbackKind = 'save' | 'apply';

interface ActionFeedbackButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'> {
  afterFeedback?: () => void;
  feedbackKind?: FeedbackKind;
  label: string;
  onAction?: () => Promise<void> | void;
}

const feedbackLabels: Record<FeedbackKind, string> = {
  apply: '√已应用',
  save: '√已保存'
};
const successClass =
  'border border-[var(--success)] bg-[var(--success-weak)] text-[var(--success-feedback-ink)] hover:border-[var(--success)] hover:bg-[var(--success-weak)] active:border-[var(--success)] active:bg-[var(--success-weak)] active:text-[var(--success-feedback-ink)]';

export function ActionFeedbackButton({
  afterFeedback,
  className,
  disabled,
  feedbackKind = 'save',
  label,
  onAction,
  type = 'button',
  ...buttonProps
}: ActionFeedbackButtonProps): JSX.Element {
  const [responded, setResponded] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  async function handleClick(): Promise<void> {
    if (disabled) {
      return;
    }

    try {
      await onAction?.();
    } catch {
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    setResponded(true);
    timerRef.current = window.setTimeout(() => {
      setResponded(false);
      timerRef.current = null;
      afterFeedback?.();
    }, 900);
  }

  return (
    <button
      {...buttonProps}
      className={[className, responded ? successClass : '']
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      type={type}
      onClick={() => void handleClick()}
    >
      {responded ? feedbackLabels[feedbackKind] : label}
    </button>
  );
}
