interface FavoriteButtonProps {
  active: boolean;
  onToggle: () => void;
}

export function FavoriteButton({
  active,
  onToggle,
}: FavoriteButtonProps): JSX.Element {
  return (
    <button
      aria-label={active ? "取消喜欢" : "喜欢"}
      className={[
        "absolute right-1 top-1 z-[2] grid h-5 w-5 place-items-center border border-(--line-strong) bg-(--surface-inset-bg) text-[12px] leading-none text-(--favorite)",
        active ? "border-(--favorite) text-(--favorite)" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={active ? "取消喜欢" : "喜欢"}
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {active ? "♥" : "♡"}
    </button>
  );
}
