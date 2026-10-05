import React from 'react';

// Decorative heart. Purely visual, hidden from screen readers.
export function Heart({ size = 24, color = 'var(--accent)', className = '', style }) {
  return (
    <svg
      className={`heart ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      <path
        fill={color}
        d="M12 21.2s-7.6-4.6-9.6-9.4C1 8.5 3 5 6.6 5c2.1 0 3.6 1.1 4.4 2.6h2C13.8 6.1 15.3 5 17.4 5 21 5 23 8.5 21.6 11.8c-2 4.8-9.6 9.4-9.6 9.4z"
      />
    </svg>
  );
}

// Three hearts in silver, red and purple.
export function HeartTrio({ size = 22 }) {
  return (
    <span className="heart-trio" aria-hidden="true">
      <Heart size={size * 0.8} color="var(--silver)" className="tilt-left" />
      <Heart size={size * 1.25} color="var(--accent)" />
      <Heart size={size * 0.8} color="var(--primary)" className="tilt-right" />
    </span>
  );
}

// Thin silver rule with a red heart in the middle.
export function HeartDivider() {
  return (
    <span className="heart-divider" aria-hidden="true">
      <span className="rule" />
      <Heart size={14} />
      <span className="rule" />
    </span>
  );
}
