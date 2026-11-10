import type { ReactNode } from 'react';

export interface TabItem<Value extends string> {
  value: Value;
  label: string;
}

/**
 * Tabs that select what one panel shows. Only the selected tab is in the tab order; the arrows,
 * Home and End move between tabs and select them, as the review queue does.
 */
export function Tabs<Value extends string>({
  id,
  label,
  tabs,
  selected,
  onSelect,
  children,
}: {
  /** Prefix of the tab and panel ids. */
  id: string;
  /** Names the tab list for assistive technology. */
  label: string;
  tabs: readonly TabItem<Value>[];
  selected: Value;
  onSelect: (value: Value) => void;
  /** The selected tab's panel. */
  children: ReactNode;
}) {
  const tabId = (value: Value) => `${id}-tab-${value}`;
  const panelId = `${id}-panel`;
  return (
    <>
      <div
        className="ui-tabs"
        role="tablist"
        aria-label={label}
        onKeyDown={(event) => {
          // The URL may update asynchronously: a quick second press starts from the focused tab.
          const focused = (event.target as HTMLElement).id;
          const index = tabs.findIndex((tab) => tabId(tab.value) === focused);
          const target = {
            ArrowRight: index + 1,
            ArrowLeft: index - 1,
            Home: 0,
            End: tabs.length - 1,
          }[event.key];
          if (target === undefined) return;
          event.preventDefault();
          const next = tabs[(target + tabs.length) % tabs.length]!.value;
          onSelect(next);
          document.getElementById(tabId(next))?.focus();
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={tabId(tab.value)}
            tabIndex={tab.value === selected ? 0 : -1}
            aria-selected={tab.value === selected}
            aria-controls={panelId}
            onClick={() => onSelect(tab.value)}
          >
            {/* Reserves the bold width, so selecting a tab does not move its neighbors. */}
            <span className="ui-tab-label" data-label={tab.label}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(selected)}>
        {children}
      </div>
    </>
  );
}
