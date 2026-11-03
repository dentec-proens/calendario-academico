import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** What people chose for each group, kept while the page lives so it survives step changes. */
const chosen = new Map<string, boolean>();

type Props = {
  /** Heading ID, also the key of the choice; the rows live under `${headingId}-rows`. */
  headingId: string;
  id?: string;
  title: string;
  count: number;
  /** Rows still to fill, shown beside the count so a collapsed group does not hide work. */
  pending?: number;
  /** Starts collapsed until opened; only the institutional base does. */
  collapsed?: boolean;
  /**
   * Signature of the active search and filters. While it is set every group opens, and a group
   * collapsed under it opens again with the next search.
   */
  filtering?: string;
  /** Holds the row in the panel or named by the link: it opens, and stays open afterwards. */
  pinned?: boolean;
  /** Problems that block publication cannot be collapsed. */
  fixed?: boolean;
  children: ReactNode;
};

/** A titled group of rows of the Activities step, collapsible from its heading. */
export default function ActivityGroup({
  headingId,
  id,
  title,
  count,
  pending = 0,
  collapsed = false,
  filtering = '',
  pinned = false,
  fixed = false,
  children,
}: Props) {
  const [kept, setKept] = useState(() => pinned || (chosen.get(headingId) ?? !collapsed));
  const [filtered, setFiltered] = useState<{ filtering: string; open: boolean }>();
  // Once pinned, the group keeps open after the panel closes, as if people had opened it.
  const [wasPinned, setWasPinned] = useState(pinned);
  if (pinned !== wasPinned) {
    setWasPinned(pinned);
    if (pinned && !kept) {
      chosen.set(headingId, true);
      setKept(true);
    }
  }
  const open =
    fixed ||
    pinned ||
    (filtering ? (filtered?.filtering === filtering ? filtered.open : true) : kept);
  const toggle = () => {
    if (filtering) setFiltered({ filtering, open: !open });
    else {
      chosen.set(headingId, !open);
      setKept(!open);
    }
  };
  const rows = `${headingId}-rows`;
  const label = (
    <span className="activity-group-label">
      <span className="activity-group-title">{title}</span>
      <span className="activity-group-count">
        <span className="visually-hidden"> (</span>
        {count}
        <span className="visually-hidden">)</span>
      </span>
      {pending > 0 && <span className="activity-group-pending"> · {pending} a preencher</span>}
    </span>
  );
  return (
    <section id={id} className="activity-group" aria-labelledby={headingId}>
      <h4 id={headingId} className="activity-group-heading">
        {fixed ? (
          label
        ) : (
          <button
            type="button"
            className="activity-group-toggle"
            aria-expanded={open}
            aria-controls={rows}
            onClick={toggle}
          >
            {label}
            <ChevronDown className="activity-group-chevron" aria-hidden="true" />
          </button>
        )}
      </h4>
      <div id={rows} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
