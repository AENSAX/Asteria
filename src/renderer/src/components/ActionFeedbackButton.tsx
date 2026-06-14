import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import {
  getButtonClassName,
  type ButtonClassOptions,
} from "./Button";
import { useLanguage } from "../utils/language";

type FeedbackKind = "save" | "apply";

interface ActionFeedbackButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onClick"
>, ButtonClassOptions {
  afterFeedback?: () => void;
  feedbackKind?: FeedbackKind;
  label: string;
  onAction?: () => Promise<void> | void;
}

const successClass =
  "!border !border-(--success) !bg-(--success-weak) !text-(--success-feedback-ink) hover:!border-(--success) hover:!bg-(--success-weak) active:!border-(--success) active:!bg-(--success-weak) active:!text-(--success-feedback-ink)";

export function ActionFeedbackButton({
  afterFeedback,
  className,
  disabled,
  fill,
  feedbackKind = "save",
  label,
  onAction,
  size,
  tone,
  type = "button",
  ...buttonProps
}: ActionFeedbackButtonProps): JSX.Element {
  const { t } = useLanguage();
  const [responded, setResponded] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

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
      className={getButtonClassName({
        className: [className, responded ? successClass : ""]
          .filter(Boolean)
          .join(" "),
        fill,
        size,
        tone,
      })}
      disabled={disabled}
      type={type}
      onClick={() => void handleClick()}
    >
      {responded
        ? feedbackKind === "apply"
          ? t("common.appliedFeedback")
          : t("common.savedFeedback")
        : label}
    </button>
  );
}
