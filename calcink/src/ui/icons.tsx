// Inline SVG icons, so the toolbar needs no icon library or network.
// They draw with currentColor and inherit the button's text colour.

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const PenIcon = () => (
  <Icon>
    <path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" />
    <path d="M14 6.6l3.4 3.4" />
  </Icon>
);

export const EraserIcon = () => (
  <Icon>
    <path d="M8.5 20H20" />
    <path d="M4.6 15.4l9.8-9.8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11.6 18.4a2 2 0 0 1-1.4.6H8.3a2 2 0 0 1-1.4-.6l-2.3-2.3a.8.8 0 0 1 0-1.1z" />
    <path d="M9.5 10.5l5 5" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
);

export const ClearIcon = () => (
  <Icon>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Icon>
);

export const LogoIcon = () => (
  <svg className="logo" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
    <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--accent)" />
    <path d="M9 13h6M9 19h6M19 12l4 8M23 12l-4 8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
  </svg>
);
