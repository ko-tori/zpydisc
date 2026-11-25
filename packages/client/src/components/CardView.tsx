import { Card, getPointValue, getSuit, parseCard } from '@zpy/shared';

interface CardViewProps {
  card: Card;
  declared?: Card;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

const SUIT_SYMBOL: Record<string, string> = {
  C: '♣',
  D: '♦',
  S: '♠',
  H: '♥',
  J: '★',
};

export function CardView({
  card,
  declared,
  selected = false,
  disabled = false,
  compact = false,
  onClick,
}: CardViewProps) {
  const [num, suit] = parseCard(card);
  const isRed = suit === 'H' || suit === 'D' || card === 'BJ';
  const isTrump = declared ? getSuit(card, declared) === 'T' : false;
  const pts = getPointValue(card);

  const label = card === 'BJ' ? 'BJ' : card === 'SJ' ? 'SJ' : num;
  const symbol = card === 'BJ' ? '🃏' : card === 'SJ' ? '🃏' : SUIT_SYMBOL[suit];

  const classes = [
    'card',
    isRed ? 'card--red' : 'card--black',
    isTrump ? 'card--trump' : '',
    selected ? 'card--selected' : '',
    disabled ? 'card--disabled' : '',
    compact ? 'card--compact' : '',
    onClick && !disabled ? 'card--clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={disabled ? undefined : onClick}
      disabled={disabled && !selected}
      title={card}
    >
      <span className="card__corner">
        <span>{label}</span>
        <span>{symbol}</span>
      </span>
      <span className="card__center">{symbol}</span>
      {pts > 0 && <span className="card__pts">+{pts}</span>}
    </button>
  );
}
