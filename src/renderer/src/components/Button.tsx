import type { ButtonHTMLAttributes } from "react";

export type ButtonTone = "default" | "primary";
export type ButtonSize =
  | "default"
  | "compact"
  | "medium"
  | "large"
  | "icon"
  | "compactIcon";

export interface ButtonClassOptions {
  className?: string | undefined;
  fill?: boolean | undefined;
  size?: ButtonSize | undefined;
  tone?: ButtonTone | undefined;
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonClassOptions {}

export const buttonClassNames = {
  base: "ui-button",
  compact: "ui-button-compact",
  compactIcon: "ui-button-compact ui-icon-button",
  fill: "ui-button-fill",
  icon: "ui-icon-button",
  large: "ui-button-lg",
  medium: "ui-button-md",
  primary: "ui-button-primary",
} as const;

export const buttonScopeClassNames = {
  compact: "ui-button-compact-scope",
  default: "ui-button-scope",
} as const;

export function getButtonClassName({
  className,
  fill = false,
  size = "default",
  tone = "default",
}: ButtonClassOptions = {}): string {
  return [
    buttonClassNames.base,
    tone === "primary" ? buttonClassNames.primary : "",
    getButtonSizeClassName(size),
    fill ? buttonClassNames.fill : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  className,
  fill,
  size,
  tone,
  type = "button",
  ...buttonProps
}: ButtonProps): JSX.Element {
  return (
    <button
      {...buttonProps}
      className={getButtonClassName({
        className,
        fill,
        size,
        tone,
      })}
      type={type}
    />
  );
}

function getButtonSizeClassName(size: ButtonSize): string {
  switch (size) {
    case "compact":
      return buttonClassNames.compact;
    case "medium":
      return buttonClassNames.medium;
    case "large":
      return buttonClassNames.large;
    case "icon":
      return buttonClassNames.icon;
    case "compactIcon":
      return buttonClassNames.compactIcon;
    default:
      return "";
  }
}
