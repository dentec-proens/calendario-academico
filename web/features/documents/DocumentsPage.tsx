import { useNavigate } from '@tanstack/react-router';
import { usePaginatedQuery } from 'convex/react';
import { useAppSession } from '../../app/session.tsx';
import { useFeatureRoute } from '../../app/navigation.ts';
import { functions } from '../../shared/convex/client.ts';
import DocumentsPanel from './DocumentsPanel.tsx';
export default function DocumentsPage() {
  const { info, permissions } = useAppSession();
  const route = useFeatureRoute();
  const navigate = useNavigate();
  const status =
    permissions.manageInstitution &&
    (route.situacao === 'rascunho' ||
      route.situacao === 'vigente' ||
      route.situacao === 'arquivado')
      ? route.situacao
      : '';
  const pagination = usePaginatedQuery(
    functions.documents.documentPage,
    {
      ...(route.ano ? { year: Number(route.ano) } : {}),
      ...(status ? { status } : {}),
    },
    { initialNumItems: 50 },
  );
  return (
    <section id="institution" className="page">
      <DocumentsPanel
        canManage={permissions.manageInstitution}
        pagination={pagination}
        liveData={
          pagination.status === 'LoadingFirstPage'
            ? undefined
            : { revision: info.catalogue.revision, documents: pagination.results }
        }
        yearFilter={route.ano}
        statusFilter={status}
        onYearFilter={(ano) => {
          void navigate({
            to: '/documentos',
            search: { ano: ano || undefined, situacao: status || undefined },
            replace: true,
          });
        }}
        onStatusFilter={(situacao) => {
          void navigate({
            to: '/documentos',
            search: { ano: route.ano || undefined, situacao: situacao || undefined },
            replace: true,
          });
        }}
        onUploaded={(ano) => {
          void navigate({ to: '/documentos', search: { ano } });
        }}
      />
    </section>
  );
}
