import type { FileRatingRecord } from '../../../shared/ipc';

interface FileRatingStackProps {
  ratings: FileRatingRecord[];
  className?: string;
}

export function FileRatingStack({ className = '', ratings }: FileRatingStackProps): JSX.Element | null {
  if (ratings.length === 0) {
    return null;
  }

  return (
    <div
      className={[
        'absolute left-1 top-1 z-[2] grid max-w-[calc(100%-8px)] justify-items-start gap-0.5 pointer-events-none',
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {ratings.map((rating) => (
        <div
          className="grid min-h-[18px] max-w-full grid-cols-[auto_minmax(0,1fr)] border border-(--line-strong) bg-(--surface-inset-bg) text-[10px] text-(--ink)"
          key={`${rating.groupId}-${rating.entryId}`}
        >
          <span className="min-w-0 px-1 leading-[16px]">{rating.groupName}:</span>
          <span className="min-w-0 px-1 leading-[16px]" style={{ color: rating.color }}>
            {rating.label}
          </span>
        </div>
      ))}
    </div>
  );
}
