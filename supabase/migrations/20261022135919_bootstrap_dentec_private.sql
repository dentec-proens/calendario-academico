-- Initial backend schema for a separate, empty test project.
-- Mirrors src/postgres-store.mjs and src/postgres-history.mjs.
-- Login, sessions and account authorization remain in the Node backend.
-- No accounts, passwords, documents, calendar fixtures or production data.

CREATE SCHEMA IF NOT EXISTS dentec_private;
REVOKE ALL ON SCHEMA dentec_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS dentec_private.app_state (
 id integer PRIMARY KEY CHECK (id = 1),
 payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS dentec_private.calendar_versions (
 calendar_id text NOT NULL,
 ordinal integer NOT NULL CHECK (ordinal > 0),
 snapshot jsonb NOT NULL,
 metadata jsonb NOT NULL,
 PRIMARY KEY (calendar_id, ordinal)
);

CREATE TABLE IF NOT EXISTS dentec_private.history_migration_backups (
 migration text PRIMARY KEY,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON ALL TABLES IN SCHEMA dentec_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA dentec_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dentec_private FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA dentec_private
 REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dentec_private
 REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dentec_private
 REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE dentec_private.app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentec_private.calendar_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentec_private.history_migration_backups ENABLE ROW LEVEL SECURITY;
-- No Data API policies: only the backend database owner accesses these tables.
-- Keep dentec_private out of the project's exposed API schemas.

-- Source snapshot: initialCatalogue() and campusNames from src/institution.mjs.
-- The normal createApp startup adds the three later campuses via updateCampuses.
INSERT INTO dentec_private.app_state (id, payload)
VALUES (1, $dentec_initial_state$
{
  "users": [],
  "campuses": [
    {
      "id": "campus-1",
      "name": "Assis Chateaubriand"
    },
    {
      "id": "campus-2",
      "name": "Arapongas"
    },
    {
      "id": "campus-3",
      "name": "Astorga"
    },
    {
      "id": "campus-4",
      "name": "Barracão"
    },
    {
      "id": "campus-5",
      "name": "Campo Largo"
    },
    {
      "id": "campus-6",
      "name": "Capanema"
    },
    {
      "id": "campus-7",
      "name": "Cascavel"
    },
    {
      "id": "campus-8",
      "name": "Colombo"
    },
    {
      "id": "campus-9",
      "name": "Coronel Vivida"
    },
    {
      "id": "campus-10",
      "name": "Curitiba"
    },
    {
      "id": "campus-11",
      "name": "Foz do Iguaçu"
    },
    {
      "id": "campus-12",
      "name": "Goioerê"
    },
    {
      "id": "campus-13",
      "name": "Irati"
    },
    {
      "id": "campus-14",
      "name": "Ivaiporã"
    },
    {
      "id": "campus-15",
      "name": "Jacarezinho"
    },
    {
      "id": "campus-16",
      "name": "Jaguariaíva"
    },
    {
      "id": "campus-17",
      "name": "Londrina"
    },
    {
      "id": "campus-18",
      "name": "Palmas"
    },
    {
      "id": "campus-19",
      "name": "Paranaguá"
    },
    {
      "id": "campus-20",
      "name": "Paranavaí"
    },
    {
      "id": "campus-21",
      "name": "Pinhais"
    },
    {
      "id": "campus-22",
      "name": "Pitanga"
    },
    {
      "id": "campus-23",
      "name": "Quedas do Iguaçu"
    },
    {
      "id": "campus-24",
      "name": "Telêmaco Borba"
    },
    {
      "id": "campus-25",
      "name": "Umuarama"
    },
    {
      "id": "campus-26",
      "name": "União da Vitória"
    }
  ],
  "calendars": [],
  "histories": [],
  "audit": [],
  "catalogue": {
    "revision": 1,
    "events": [
      {
        "id": "national-0",
        "name": "Confraternização Universal",
        "start": "2027-01-01",
        "end": "2027-01-01",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 662/1949: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "national-1",
        "name": "Tiradentes",
        "start": "2027-04-21",
        "end": "2027-04-21",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 662/1949: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "national-2",
        "name": "Dia do Trabalho",
        "start": "2027-05-01",
        "end": "2027-05-01",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 662/1949: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "national-3",
        "name": "Independência do Brasil",
        "start": "2027-09-07",
        "end": "2027-09-07",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 662/1949: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "national-4",
        "name": "Nossa Senhora Aparecida",
        "start": "2027-10-12",
        "end": "2027-10-12",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 6.802/1980: https://www.planalto.gov.br/ccivil_03/leis/l6802.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "national-5",
        "name": "Finados",
        "start": "2027-11-02",
        "end": "2027-11-02",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 662/1949: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "national-6",
        "name": "Proclamação da República",
        "start": "2027-11-15",
        "end": "2027-11-15",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 662/1949: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "national-7",
        "name": "Dia Nacional de Zumbi e da Consciência Negra",
        "start": "2027-11-20",
        "end": "2027-11-20",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 14.759/2023: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "national-8",
        "name": "Natal",
        "start": "2027-12-25",
        "end": "2027-12-25",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Lei 662/1949: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-0",
        "name": "Recesso acadêmico e administrativo",
        "start": "2027-02-08",
        "end": "2027-02-08",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-1",
        "name": "Carnaval — recesso acadêmico e administrativo",
        "start": "2027-02-09",
        "end": "2027-02-09",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-2",
        "name": "Quarta-feira de Cinzas — recesso acadêmico e administrativo",
        "start": "2027-02-10",
        "end": "2027-02-10",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-3",
        "name": "Paixão de Cristo — impedimento previsto no calendário IFPR",
        "start": "2027-03-26",
        "end": "2027-03-26",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-4",
        "name": "Dia Nacional da Luta pela Educação Inclusiva",
        "start": "2027-04-14",
        "end": "2027-04-14",
        "kind": "note",
        "category": "comemorativo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-5",
        "name": "Corpus Christi — recesso acadêmico e administrativo",
        "start": "2027-05-27",
        "end": "2027-05-27",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-6",
        "name": "Recesso acadêmico e administrativo",
        "start": "2027-05-28",
        "end": "2027-05-28",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-7",
        "name": "Prazo para informar cursos e vagas à PROENS",
        "start": "2027-05-31",
        "end": "2027-05-31",
        "kind": "note",
        "category": "prazo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-8",
        "name": "Dia Mundial do Meio Ambiente",
        "start": "2027-06-05",
        "end": "2027-06-05",
        "kind": "note",
        "category": "comemorativo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-9",
        "name": "Dia Nacional de Imunização",
        "start": "2027-06-09",
        "end": "2027-06-09",
        "kind": "note",
        "category": "comemorativo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-10",
        "name": "Prazo de referência dos editais do Processo Seletivo 2028",
        "start": "2027-06-15",
        "end": "2027-06-15",
        "kind": "note",
        "category": "prazo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-11",
        "name": "Lei Brasileira de Inclusão da Pessoa com Deficiência",
        "start": "2027-07-06",
        "end": "2027-07-06",
        "kind": "note",
        "category": "comemorativo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-12",
        "name": "Dia Nacional dos Profissionais da Educação",
        "start": "2027-08-06",
        "end": "2027-08-06",
        "kind": "note",
        "category": "comemorativo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-13",
        "name": "Dia do Estudante",
        "start": "2027-08-11",
        "end": "2027-08-11",
        "kind": "note",
        "category": "comemorativo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-14",
        "name": "Recesso acadêmico e administrativo",
        "start": "2027-09-06",
        "end": "2027-09-06",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-15",
        "name": "Recesso acadêmico e administrativo",
        "start": "2027-10-11",
        "end": "2027-10-11",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-16",
        "name": "Dia do Professor — feriado escolar",
        "start": "2027-10-15",
        "end": "2027-10-15",
        "kind": "exclude",
        "category": "feriado",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-17",
        "name": "Dia do Servidor Público — recesso acadêmico e administrativo",
        "start": "2027-10-28",
        "end": "2027-10-28",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-18",
        "name": "Recesso acadêmico e administrativo",
        "start": "2027-10-29",
        "end": "2027-10-29",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-19",
        "name": "Recesso acadêmico e administrativo",
        "start": "2027-11-01",
        "end": "2027-11-01",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-20",
        "name": "Recesso acadêmico e administrativo",
        "start": "2027-12-24",
        "end": "2027-12-24",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-21",
        "name": "Criação do IFPR e da Rede Federal de EPT",
        "start": "2027-12-29",
        "end": "2027-12-29",
        "kind": "note",
        "category": "institucional",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-22",
        "name": "Recesso acadêmico e administrativo",
        "start": "2027-12-31",
        "end": "2027-12-31",
        "kind": "exclude",
        "category": "recesso",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-science",
        "name": "Mês Nacional da Ciência, Tecnologia e Inovações",
        "start": "2027-10-01",
        "end": "2027-10-31",
        "kind": "note",
        "category": "comemorativo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, art. 2º",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      },
      {
        "id": "ifpr2027-library",
        "name": "Semana Nacional do Livro e da Biblioteca",
        "start": "2027-10-23",
        "end": "2027-10-29",
        "kind": "note",
        "category": "comemorativo",
        "evidence": "Resolução IFPR 2027 — SEI 4354987, art. 2º",
        "offers": [
          "integrado",
          "subsequente",
          "graduacao"
        ],
        "active": true
      }
    ]
  }
}
$dentec_initial_state$::jsonb)
ON CONFLICT (id) DO NOTHING;
