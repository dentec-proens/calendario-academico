import type { ReactNode, Ref } from 'react';
import './search-field.css';

/** Longest search kept in the URL and accepted by the calendar query. */
const maximumLength = 200;

/** The search box of the lists. Its parent decides what is searched and where the text lives. */
export function SearchField({
  id,
  value,
  hint,
  inputRef,
  onChange,
}: {
  id: string;
  value: string;
  /** What the search reaches, shown while the box is empty. */
  hint: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="search-field">
      Buscar
      <input
        id={id}
        ref={inputRef}
        type="search"
        value={value}
        maxLength={maximumLength}
        placeholder={hint}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/**
 * How many results a list shows. Screen readers may ignore a status inserted with its text, so
 * this stays mounted and empty until there is something to say. `quiet` is for when the list
 * already shows the same message.
 */
export function ResultStatus({
  id,
  quiet = false,
  children,
}: {
  id: string;
  quiet?: boolean;
  children?: ReactNode;
}) {
  return (
    <p id={id} role="status" className={quiet ? 'visually-hidden' : 'result-status'}>
      {children}
    </p>
  );
}
