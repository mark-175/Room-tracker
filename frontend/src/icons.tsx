// Inline SVG icons (same paths as the old app.js). Styled by the shared
// `.ic` CSS rule; context-specific sizing comes from parent selectors
// (e.g. `.room-link .ic`, `.overdue-hint .ic`).
const svgProps = {
  viewBox: '0 0 24 24',
  className: 'ic',
  'aria-hidden': true,
} as const;

export const ExportIcon = () => (
  <svg {...svgProps}>
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
  </svg>
);

export const ImportIcon = () => (
  <svg {...svgProps}>
    <path d="M12 21V9m0 0l-4 4m4-4l4 4M5 3h14" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...svgProps}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const LinkIcon = () => (
  <svg {...svgProps}>
    <path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h5" />
  </svg>
);

export const AlertIcon = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...svgProps}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);

export const EditIcon = () => (
  <svg {...svgProps}>
    <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3zM13.5 6.5l3 3" />
  </svg>
);
