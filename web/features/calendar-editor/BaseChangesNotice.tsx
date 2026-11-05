import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Notice } from '../../components/ui/Notice.tsx';
import { announcedRuleChanges } from '#src/domain/policies/registry.ts';
import { editorPages } from './editor-steps.ts';
import { useCalendarEditor } from './session/CalendarEditorProvider.tsx';

const dayAndMonth = (date: string) => date.split('-').reverse().slice(0, 2).join('/');

/**
 * Tells what the system already applied: nothing here asks for a decision. Saving records what is
 * in force and ends the difference, so the notice stays for the session it first appeared in.
 */
export default function BaseChangesNotice() {
  const { record, baseUpdate, readOnly } = useCalendarEditor();
  const [dismissed, setDismissed] = useState(false);
  const [shown, setShown] = useState<ReturnType<typeof announcement>>(null);
  const current = readOnly ? null : announcement(record, baseUpdate);
  if (current && current.key !== shown?.key) setShown(current);
  if (dismissed || !shown) return null;
  return (
    <Notice
      id="base-changes-notice"
      tone="info"
      title={shown.title}
      onDismiss={() => setDismissed(true)}
      actions={
        <Link
          to={editorPages.issues.path}
          params={{ calendarId: record.id }}
          search={(previous) => previous}
        >
          Ver pendências
        </Link>
      }
    >
      <ul>
        {shown.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {shown.review && <p>Se já houver parecer, ele precisará ser refeito sob estas regras.</p>}
    </Notice>
  );
}

function announcement(
  record: ReturnType<typeof useCalendarEditor>['record'],
  { rules, documents }: ReturnType<typeof useCalendarEditor>['baseUpdate'],
) {
  const changes = announcedRuleChanges(rules, record.updatedAt);
  const references = [...documents.added, ...documents.changed.map(({ after }) => after)];
  const items = [
    ...changes.map((change) => change.summary),
    ...references.map((document) => `Documento de referência atualizado: ${document.title}.`),
    ...documents.removed.map((document) => `Documento de referência retirado: ${document.title}.`),
  ];
  if (!items.length) return null;
  const latest = changes.at(-1)?.date;
  return {
    key: items.join('|'),
    title: latest
      ? `As regras de ${record.state.year} mudaram em ${dayAndMonth(latest)}. As novas regras não alteraram suas datas.`
      : 'Os documentos de referência foram atualizados. Suas datas não mudaram.',
    items,
    review: record.status === 'devolvido' && changes.some((change) => change.effect === 'tightens'),
  };
}
