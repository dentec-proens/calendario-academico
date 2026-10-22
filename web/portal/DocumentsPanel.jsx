import {useCallback, useEffect, useRef, useState} from 'react';
import {Archive, CheckCircle2, Download, RefreshCw, Upload} from 'lucide-react';
import {filePayload} from '../upload.js';
import {api} from './api.js';

const documentTypes = {
  norma: 'Resolução / norma',
  referencia: 'Calendário de referência',
  parecer: 'Modelo de parecer / checklist',
};

export default function DocumentsPanel({isAdmin, onChanged, refreshKey}) {
  const [documents, setDocuments] = useState([]);
  const [revision, setRevision] = useState(0);
  const [yearFilter, setYearFilter] = useState('');
  const [confirmed, setConfirmed] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const mutationPending = useRef(false);

  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const data = await api('/api/documents');
      if (ticket !== generation.current) return;
      setRevision(data.revision);
      setDocuments(data.documents);
      setConfirmed({});
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    refresh().catch(error => { if (active) setMessage(error.message); });
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [refresh, isAdmin, refreshKey]);

  async function reloadDocuments() {
    try {
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function uploadDocument(event) {
    event.preventDefault();
    if (mutationPending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get('file');
    mutationPending.current = true;
    setPending(true);
    setMessage('');
    try {
      if (!file?.name || file.size > 8_000_000) throw Error('Escolha um PDF de até 8 MB.');
      const payload = await filePayload(file, 'document');
      const year = Number(values.get('year'));
      await api('/api/documents', 'POST', {
        year,
        type: values.get('type'),
        title: values.get('title'),
        source: values.get('source'),
        filename: file.name,
        ...payload,
      });
      form.reset();
      setYearFilter(String(year));
      await refresh();
      setMessage('Arquivo preservado como rascunho. Confira e defina como vigente para disponibilizá-lo aos campi.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  }

  async function changeStatus(document, status) {
    if (mutationPending.current) return;
    const hasConfirmed = confirmed[document.id] === true;
    if (status === 'vigente' && !hasConfirmed) {
      setMessage('Marque a conferência do documento antes de definir a vigência.');
      return;
    }
    mutationPending.current = true;
    setPending(true);
    setMessage('');
    try {
      await api(`/api/documents/${encodeURIComponent(document.id)}/status`, 'POST', {
        revision,
        status,
        confirmed: hasConfirmed,
      });
      await Promise.all([refresh(), onChanged?.()]);
      setMessage('Vigência atualizada. Calendários e pareceres existentes deverão ser conferidos com a nova base.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  }

  const year = Number(yearFilter);
  const filteredDocuments = documents
    .filter(document => !year || document.year === year)
    .sort((a, b) => b.year - a.year || a.type.localeCompare(b.type) || b.version - a.version);
  const busy = pending || loading;

  return (
    <div className="panel">
      <h2>Documentos da PROENS por ano</h2>
      <p>Consulte a resolução, o calendário de referência e o modelo de parecer vigentes. Cada substituição preserva o arquivo anterior.</p>
      <p className="notice">Os PDFs são documentos para consulta. O envio não extrai datas, não muda as cores do calendário nem reprograma a análise automática. Confira e atualize os eventos abaixo; mudanças nas regras de cálculo e no checklist precisam ser implementadas e verificadas. A análise atual usa o parecer de 2026 e sinaliza quando o ano é diferente.</p>
      <label>
        Filtrar documentos por ano
        <input id="document-year-filter" type="number" min="1900" max="9999" placeholder="Todos os anos" value={yearFilter} onChange={event => setYearFilter(event.target.value)} />
      </label>
      <button type="button" id="document-refresh" className="secondary" disabled={busy} onClick={reloadDocuments}>
        <RefreshCw size={16} aria-hidden="true" /> Atualizar lista
      </button>
      <p id="document-message" role="status" aria-live="polite">{message}</p>
      {isAdmin ? (
        <form id="document-form" onSubmit={uploadDocument} aria-busy={pending}>
          <h3>Adicionar nova versão</h3>
          <div className="row-form">
            <label>Ano de aplicação<input id="document-year" name="year" type="number" min="1900" max="9999" required disabled={pending} /></label>
            <label>
              Tipo
              <select id="document-type" name="type" disabled={pending}>
                <option value="norma">Resolução / norma</option>
                <option value="referencia">Calendário de referência PROENS</option>
                <option value="parecer">Modelo de parecer / checklist</option>
              </select>
            </label>
          </div>
          <label>Título<input id="document-title" name="title" maxLength="240" required disabled={pending} /></label>
          <label>Identificação e fundamento de aplicação<input id="document-source" name="source" maxLength="1000" required placeholder="Número SEI, resolução e informação sobre aprovação ou vigência" disabled={pending} /></label>
          <label>Arquivo PDF (até 8 MB)<input id="document-file" name="file" type="file" accept="application/pdf,.pdf" required disabled={pending} /></label>
          <button type="submit" disabled={busy}><Upload size={16} aria-hidden="true" /> Enviar para conferência</button>
          <p className="help">Após enviar, baixe e confira o arquivo, o ano e sua aplicabilidade. Então marque a conferência e use “Definir como vigente”. Haverá somente uma versão vigente de cada tipo por ano. Isso não declara aprovação oficial de calendários.</p>
        </form>
      ) : null}
      <ul id="document-list" className="records" aria-busy={busy}>
        {filteredDocuments.length ? filteredDocuments.map(document => (
          <li key={document.id}>
            <div>
              <strong>{document.title}</strong>
              <small>{document.year} · {documentTypes[document.type]} · versão {document.version} · {document.status}</small>
              <small>{document.source}</small>
              <small>Enviado em {new Date(document.createdAt).toLocaleString('pt-BR')} · {(document.size / 1024).toFixed(0)} KB</small>
              <a href={`/api/documents/${encodeURIComponent(document.id)}`}><Download size={16} aria-hidden="true" /> Baixar PDF</a>
              {isAdmin ? (
                <div>
                  {document.status !== 'vigente' ? (
                    <>
                      <label className="check">
                        <input type="checkbox" data-confirm-document={document.id} checked={confirmed[document.id] === true} disabled={busy} onChange={event => setConfirmed(current => ({...current, [document.id]: event.target.checked}))} />
                        Conferi o arquivo, o ano e sua aplicabilidade
                      </label>
                      <button type="button" data-document-status="vigente" data-document-id={document.id} disabled={busy} onClick={() => changeStatus(document, 'vigente')}>
                        <CheckCircle2 size={16} aria-hidden="true" /> Definir como vigente
                      </button>
                    </>
                  ) : (
                    <button type="button" className="secondary" data-document-status="arquivado" data-document-id={document.id} disabled={busy} onClick={() => changeStatus(document, 'arquivado')}>
                      <Archive size={16} aria-hidden="true" /> Retirar de vigência
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </li>
        )) : <li>Nenhum documento disponível para este ano. A ausência de arquivo não comprova ausência de exigências institucionais.</li>}
      </ul>
    </div>
  );
}
