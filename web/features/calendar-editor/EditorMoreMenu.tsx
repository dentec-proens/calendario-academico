import { useRef } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Link } from '@tanstack/react-router';
import { Download, Ellipsis, History, Upload } from 'lucide-react';
import ImportCalendarForm from './forms/ImportCalendarForm.tsx';
import { editorPages } from './editor-steps.ts';

/** The occasional actions of the calendar, outside the path of filling it in. */
export default function EditorMoreMenu({
  calendarId,
  readOnly,
  onCopy,
}: {
  calendarId: string;
  readOnly: boolean;
  onCopy: () => void;
}) {
  const importInput = useRef<HTMLInputElement>(null);
  return (
    <>
      {!readOnly && <ImportCalendarForm input={importInput} />}
      <Menu.Root modal={false}>
        <Menu.Trigger className="editor-more-trigger" aria-label="Mais ações">
          <Ellipsis aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            className="editor-more-positioner"
            align="end"
            sideOffset={7}
            collisionPadding={16}
          >
            <Menu.Popup className="editor-more-content">
              {/* Reading the history needs only access to the calendar, even when it is locked. */}
              <Menu.LinkItem
                closeOnClick
                render={
                  <Link
                    to={editorPages.operations.path}
                    params={{ calendarId }}
                    search={(previous) => previous}
                  />
                }
                className="editor-history"
                aria-label="Histórico do calendário"
                aria-describedby="calendar-history-description"
                title="Consulte as operações registradas neste calendário e quem as fez."
              >
                <History aria-hidden="true" />
                <span className="editor-menu-copy">
                  <span>Histórico do calendário</span>
                  <small id="calendar-history-description">Operações deste calendário</small>
                </span>
              </Menu.LinkItem>
              {!readOnly && (
                <Menu.Item
                  id="load"
                  aria-label="Importar cópia"
                  aria-describedby="import-copy-description"
                  title="Abra uma cópia editável (.json) deste mesmo calendário. Os dados atuais serão substituídos após sua confirmação."
                  onClick={() => importInput.current?.click()}
                >
                  <Upload aria-hidden="true" />
                  <span className="editor-menu-copy">
                    <span>Importar cópia</span>
                    <small id="import-copy-description">Restaurar uma cópia editável (.json)</small>
                  </span>
                </Menu.Item>
              )}
              <Menu.Item
                id="save"
                aria-label="Baixar cópia"
                aria-describedby="download-copy-description"
                title="Baixe uma cópia editável (.json) dos dados já incluídos no calendário para importar depois. Campos ainda em preenchimento não entram nessa cópia; o PDF fica na revisão."
                onClick={onCopy}
              >
                <Download aria-hidden="true" />
                <span className="editor-menu-copy">
                  <span>Baixar cópia</span>
                  <small id="download-copy-description">
                    Guardar os dados já incluídos (.json)
                  </small>
                </span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
