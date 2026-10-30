import { usePaginatedQuery } from 'convex/react';
import { functions } from '../../shared/convex/client.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import ReviewQueue from './ReviewQueue.tsx';

export default function ReviewsPage() {
  const pagination = usePaginatedQuery(functions.reviews.reviewQueue, {}, { initialNumItems: 50 });
  return (
    <section id="review-panel" className="page">
      <div className="panel">
        <h2>Revisão técnico-pedagógica · DENTEC/PROENS</h2>
        <p>
          A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI. Não constitui aprovação
          institucional.
        </p>
        <ReviewQueue items={pagination.results} />
        <Pagination
          pagination={pagination}
          label="Carregar mais calendários"
          loadingLabel="Carregando calendários para revisão…"
        />
        <div id="review-message" role="status" aria-live="polite">
          {!pagination.results.length && pagination.status === 'Exhausted' ? (
            <Notice tone="info">Nenhum calendário disponível para revisão.</Notice>
          ) : null}
        </div>
      </div>
    </section>
  );
}
