import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import { Button } from '../../components/ui/Button.tsx';
import { downloadNative, saveBlob } from '../../shared/convex/files.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import type { DocumentsData } from '../../shared/convex/types.ts';

GlobalWorkerOptions.workerSrc = new URL(
  '../../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

export default function DocumentReader({
  document: record,
  onClose,
}: {
  document: DocumentsData['documents'][number];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const titleId = useId();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [file, setFile] = useState<{ blob: Blob; filename: string; url: string } | null>(null);
  const [error, setError] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState('1');
  const [width, setWidth] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [text, setText] = useState('');

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    element.showModal();
    closeButton.current?.focus();
    const observer = new ResizeObserver(() => setWidth(stage.current!.clientWidth - 32));
    observer.observe(stage.current!);
    return () => {
      observer.disconnect();
      element.close();
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let loading: PDFDocumentLoadingTask | undefined;
    let url: string | undefined;
    async function load() {
      const downloaded = await downloadNative({ kind: 'document', id: record.id }, record.filename);
      if (!active) return;
      url = URL.createObjectURL(new Blob([downloaded.blob], { type: 'application/pdf' }));
      setFile({ ...downloaded, url });
      const data = await downloaded.blob.arrayBuffer();
      if (!active) return;
      loading = getDocument({
        data,
        disableFontFace: true,
        useSystemFonts: true,
        useWasm: false,
        stopAtErrors: true,
      });
      const document = await loading.promise;
      if (active) setPdf(document);
    }
    void load().catch((cause) => {
      if (active) setError(nativeError(cause).message);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      void loading?.destroy();
    };
  }, [record.id, record.filename]);

  useEffect(() => {
    if (!pdf || !width) return;
    let active = true;
    let task: RenderTask | undefined;
    async function render() {
      const page = await pdf!.getPage(pageNumber);
      if (!active) return;
      setRendering(true);
      setText('');
      setError('');
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: (Math.min(width, 1000) / base.width) * Number(zoom),
      });
      const element = canvas.current!;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.ceil(viewport.width * ratio);
      element.height = Math.ceil(viewport.height * ratio);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      task = page.render({ canvas: element, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await task.promise;
      const content = await page.getTextContent();
      if (!active) return;
      setText(
        content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join(''),
      );
      setRendering(false);
    }
    void render().catch((cause) => {
      if (active) {
        setRendering(false);
        setError(nativeError(cause).message);
      }
    });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [pdf, width, pageNumber, zoom]);

  return (
    <dialog
      ref={dialog}
      className="document-reader"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="document-reader__header">
        <Button ref={closeButton} variant="secondary" onClick={onClose}>
          <ArrowLeft size={16} aria-hidden="true" /> Voltar à lista
        </Button>
        <div>
          <h2 id={titleId}>{record.title}</h2>
          <p>
            {record.year} · Versão {record.version} · {record.source}
          </p>
        </div>
      </div>
      <div className="document-reader__toolbar" aria-label="Controles de leitura">
        <div className="document-reader__pages">
          <Button
            variant="secondary"
            aria-label="Página anterior"
            disabled={!pdf || pageNumber === 1}
            onClick={() => setPageNumber((page) => page - 1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Button>
          <span role="status">
            {pdf ? `Página ${pageNumber} de ${pdf.numPages}` : 'Carregando PDF…'}
          </span>
          <Button
            variant="secondary"
            aria-label="Próxima página"
            disabled={!pdf || pageNumber === pdf.numPages}
            onClick={() => setPageNumber((page) => page + 1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        </div>
        <label>
          Zoom
          <select value={zoom} onChange={(event) => setZoom(event.target.value)}>
            <option value="1">Ajustar à largura</option>
            <option value="1.5">Ampliar 150%</option>
            <option value="2">Ampliar 200%</option>
          </select>
        </label>
      </div>
      {error ? (
        <p className="error" role="alert">
          Não foi possível exibir o PDF. {error}
          {file
            ? ' Você pode abrir o original em outra aba.'
            : ' Feche o leitor e tente novamente.'}
        </p>
      ) : null}
      <div ref={stage} className="document-reader__stage" aria-busy={rendering && !error}>
        {rendering && !error ? <p role="status">Preparando página…</p> : null}
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Página ${pageNumber} de ${record.title}. O texto está disponível após a página.`}
          hidden={!pdf || Boolean(error)}
        />
      </div>
      <div className="document-reader__footer">
        {text ? (
          <details>
            <summary>Texto da página {pageNumber}</summary>
            <p className="document-reader__text">{text}</p>
          </details>
        ) : null}
        {file ? (
          <div className="document-reader__file-actions">
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden="true" /> Abrir PDF original em outra aba
            </a>
            <Button
              variant="secondary"
              data-download-document={record.id}
              onClick={() => saveBlob(file.blob, file.filename)}
            >
              <Download size={16} aria-hidden="true" /> Baixar cópia
            </Button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
