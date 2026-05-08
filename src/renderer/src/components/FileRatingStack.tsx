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
    <div className={['file-rating-stack', className].filter(Boolean).join(' ')}>
      {ratings.map((rating) => (
        <div className="file-rating-badge" key={`${rating.groupId}-${rating.entryId}`}>
          <span>{rating.groupName}:</span>
          <span style={{ color: rating.color }}>{rating.label}</span>
        </div>
      ))}
    </div>
  );
}
