interface FavoriteButtonProps {
  active: boolean;
  onToggle: () => void;
}

export function FavoriteButton({ active, onToggle }: FavoriteButtonProps): JSX.Element {
  return (
    <button
      aria-label={active ? '取消喜欢' : '喜欢'}
      className={active ? 'favorite-button active' : 'favorite-button'}
      title={active ? '取消喜欢' : '喜欢'}
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
      {active ? '♥' : '♡'}
    </button>
  );
}
