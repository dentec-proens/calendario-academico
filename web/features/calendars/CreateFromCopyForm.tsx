import { useNavigate } from '@tanstack/react-router';
import { useFeatureRoute } from '../../app/navigation.ts';
import { MapPin } from 'lucide-react';
import { calendarName } from '#src/domain/calendar/label.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { calendars as calendarClient } from '../../shared/convex/calendars.ts';
import type { Bootstrap } from '../../shared/convex/types.ts';
import { FormFeedback } from '../../shared/forms/FormFeedback.tsx';
import { useDraftForm } from '../../shared/forms/useDraftForm.ts';
import { editorPages } from '../calendar-editor/editor-steps.ts';
import { copySourceLabel, useCopySources } from './copy-sources.ts';
import OfferChoices, { offersSummary, type CreationOffer } from './OfferChoices.tsx';

/**
 * Creates the draft that receives the copied dates, which are chosen next in the editor. Campus and
 * year come from the source, since dates are copied only within the same campus and year.
 */
export default function CreateFromCopyForm({
  info,
  canSelectCampus,
}: {
  info: Bootstrap;
  canSelectCampus: boolean;
}) {
  const navigate = useNavigate();
  const { campus: selectedCampus } = useFeatureRoute();
  const defaults: {
    campusId: string;
    sourceId: string;
    year: number;
    offers: CreationOffer[];
  } = { campusId: selectedCampus, sourceId: '', year: 0, offers: [] };
  const { form, values, submit, pending, error, clearDraft } = useDraftForm({
    draftKey: `calendar:new-from-copy:${info.user.id}`,
    defaultValues: defaults,
    onSubmit: async (value, { isCurrent }) => {
      const campus = info.campuses.find((item) => item.id === value.campusId) || info.campuses[0];
      if (!campus)
        throw new Error(
          'Nenhum campus ativo está disponível para esta conta. Solicite à administração PROENS a conferência do seu cadastro.',
        );
      if (!value.sourceId) throw new Error('Escolha o calendário de origem.');
      if (!value.offers.length) throw new Error('Marque ao menos uma oferta.');
      const calendar = await calendarClient.create({
        campusId: campus.id,
        year: value.year,
        offers: value.offers,
      });
      if (!isCurrent()) return;
      clearDraft();
      await navigate({
        to: editorPages.copy.path,
        params: { calendarId: calendar.id },
        search: { origem: value.sourceId },
      });
    },
  });
  const campus = info.campuses.find((item) => item.id === values.campusId) || info.campuses[0];
  const { sources, loading } = useCopySources(campus?.id);
  const source = sources.find((item) => item.id === values.sourceId);
  const summary = offersSummary(values.offers);
  return (
    <form id="create-calendar-from-copy" onSubmit={submit}>
      <fieldset className="form-fields" disabled={pending || !campus}>
        <p className="help">
          Crie o rascunho e escolha em seguida quais datas copiar. O ano vem do calendário de
          origem.
        </p>
        {canSelectCampus ? (
          <label className="calendar-create-campus">
            Campus
            <select
              id="calendar-campus"
              required
              value={campus?.id || ''}
              onChange={(event) => {
                form.setFieldValue('campusId', event.target.value);
                form.setFieldValue('sourceId', '');
              }}
            >
              {info.campuses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : campus ? (
          <p id="calendar-campus" className="calendar-create-campus-name">
            <MapPin aria-hidden="true" size={16} /> Campus {campus.name}
          </p>
        ) : null}
        {!loading && !sources.length ? (
          <Notice id="calendar-source-empty" announce="polite">
            Este campus ainda não tem calendário para copiar. Use Novo calendário.
          </Notice>
        ) : (
          <label className="calendar-create-source">
            Calendário de origem
            <select
              id="calendar-source"
              required
              value={source?.id || ''}
              onChange={(event) => {
                const chosen = sources.find((item) => item.id === event.target.value);
                form.setFieldValue('sourceId', chosen?.id || '');
                form.setFieldValue('year', chosen?.year || 0);
              }}
            >
              <option value="">Selecione</option>
              {sources.map((item) => (
                <option key={item.id} value={item.id}>
                  {copySourceLabel(item)}
                </option>
              ))}
            </select>
          </label>
        )}
        <OfferChoices
          offers={values.offers}
          onChange={(offers) => form.setFieldValue('offers', offers)}
        />
        <div className="calendar-create-footer">
          <div className="calendar-create-preview">
            <output id="calendar-name" aria-label="Nome do calendário">
              {campus && source
                ? calendarName(source.year, campus.name)
                : 'Escolha o calendário de origem'}
            </output>
            <small id="calendar-offer-summary">
              {summary || 'Nenhuma oferta marcada'} · começa como rascunho
            </small>
          </div>
          <Button type="submit" pending={pending} disabled={!source} loadingLabel="Criando…">
            Criar rascunho e escolher datas
          </Button>
        </div>
      </fieldset>
      <FormFeedback error={error} />
    </form>
  );
}
