import { useNavigate } from '@tanstack/react-router';
import { useFeatureRoute } from '../../app/navigation.ts';
import { useQuery } from 'convex/react';
import { functions } from '../../shared/convex/client.ts';

export default function OnlineUsersPanel() {
  const data = useQuery(functions.presence.online, {});
  const navigate = useNavigate();
  const route = useFeatureRoute();
  const search = route.busca;
  const campus = route.campus;
  const setSearch = (busca: string) => {
    void navigate({
      to: '/usuarios-online',
      search: { busca: busca || undefined, campus: campus || undefined },
      replace: true,
    });
  };
  const setCampus = (value: string) => {
    void navigate({
      to: '/usuarios-online',
      search: { busca: search || undefined, campus: value || undefined },
      replace: true,
    });
  };
  const users = data?.users ?? [];
  const campuses = [
    ...new Map(
      users.filter((user) => user.campusId).map((user) => [user.campusId!, user.campusName]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = users.filter(
    (user) =>
      (!campus || (user.campusId ?? 'institutional') === campus) &&
      (!term || `${user.name} ${user.email}`.toLocaleLowerCase('pt-BR').includes(term)),
  );

  return (
    <section className="page panel online-users" aria-labelledby="online-title" aria-busy={!data}>
      <h2 id="online-title">Usuários online</h2>
      <p className="help">
        Pessoas com o sistema aberto e conectado, no portal ou no editor. A lista se atualiza
        automaticamente. Uma perda de conexão pode levar cerca de 90 segundos para aparecer.
      </p>
      {!data ? (
        <p role="status">Carregando usuários online…</p>
      ) : (
        <>
          <div className="online-summary" aria-live="polite" role="status">
            <strong>{users.length} usuário(s) online</strong>
            <span>{campuses.length} campus/campi conectado(s)</span>
          </div>
          {data.truncated ? (
            <p className="notice">
              Exibindo até 1.000 pessoas. Os totais se referem à lista exibida.
            </p>
          ) : null}
          <div className="online-filters">
            <label>
              Buscar por nome ou e-mail
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Campus
              <select value={campus} onChange={(event) => setCampus(event.target.value)}>
                <option value="">Todos os campi</option>
                <option value="institutional">Institucional</option>
                {campuses.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filtered.length ? (
            <div className="online-table-scroll">
              <table>
                <caption className="help">
                  {filtered.length} pessoa(s) na lista · Cada pessoa é contada uma vez, mesmo com
                  várias abas ou dispositivos.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Usuário</th>
                    <th scope="col">Campus</th>
                    <th scope="col">Perfil</th>
                    <th scope="col">Status</th>
                    <th scope="col">Última presença</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </td>
                      <td>{user.campusName}</td>
                      <td>{user.role}</td>
                      <td>
                        <span className="online-status">Online</span>
                      </td>
                      <td>Agora</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="status">
              {users.length
                ? 'Nenhum usuário corresponde aos filtros.'
                : 'Nenhum usuário online no momento.'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
