// Each ordinal is retained, including equal snapshots. This is relocation,
// never deduplication. The original document is retained as a private backup.
const metadata=v=>`jsonb_strip_nulls(jsonb_build_object('version',${v}->'version','at',${v}->'at','catalogueRevision',${v}->'catalogueRevision'))`;
export const historyMetadataSql=metadata;

export async function prepareHistoryTables(pool){
 const {rows}=await pool.query("SELECT to_regclass('dentec_private.calendar_versions') AS versions, to_regclass('dentec_private.history_migration_backups') AS backups");
 if(rows[0]?.versions&&rows[0]?.backups)return;
 for(const sql of [
  'CREATE TABLE IF NOT EXISTS dentec_private.calendar_versions (calendar_id text NOT NULL, ordinal integer NOT NULL CHECK (ordinal > 0), snapshot jsonb NOT NULL, metadata jsonb NOT NULL, PRIMARY KEY (calendar_id,ordinal))',
  'REVOKE ALL ON dentec_private.calendar_versions FROM PUBLIC',
  'ALTER TABLE dentec_private.calendar_versions ENABLE ROW LEVEL SECURITY',
  'CREATE TABLE IF NOT EXISTS dentec_private.history_migration_backups (migration text PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())',
  'REVOKE ALL ON dentec_private.history_migration_backups FROM PUBLIC',
  'ALTER TABLE dentec_private.history_migration_backups ENABLE ROW LEVEL SECURITY'
 ])await pool.query(sql);
}

// Caller holds the canonical row lock. All copy, comparison and replacement
// steps commit together. Conflicting content aborts the entire transaction.
export async function archiveInlineHistory(client){
 await client.query(`INSERT INTO dentec_private.history_migration_backups (migration,payload)
 SELECT 'separate-calendar-history-v1',payload FROM dentec_private.app_state WHERE id=1
 AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(payload->'calendars','[]'::jsonb)) c,
 jsonb_array_elements(coalesce(c->'versions','[]'::jsonb)) v WHERE v IS DISTINCT FROM ${metadata('v')})
 ON CONFLICT (migration) DO NOTHING`);
 await client.query(`INSERT INTO dentec_private.calendar_versions (calendar_id,ordinal,snapshot,metadata)
 SELECT c->>'id',n::integer,v,${metadata('v')} FROM dentec_private.app_state s,
 jsonb_array_elements(coalesce(s.payload->'calendars','[]'::jsonb)) c,
 jsonb_array_elements(coalesce(c->'versions','[]'::jsonb)) WITH ORDINALITY entries(v,n)
 WHERE s.id=1 ON CONFLICT (calendar_id,ordinal) DO NOTHING`);
 const {rows}=await client.query(`SELECT count(*)::integer AS conflicts FROM dentec_private.app_state s
 CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.payload->'calendars','[]'::jsonb)) c
 CROSS JOIN LATERAL jsonb_array_elements(coalesce(c->'versions','[]'::jsonb)) WITH ORDINALITY entries(v,n)
 LEFT JOIN dentec_private.calendar_versions h ON h.calendar_id=c->>'id' AND h.ordinal=n
 WHERE s.id=1 AND (h.ordinal IS NULL OR CASE WHEN v=h.metadata THEN false ELSE v IS DISTINCT FROM h.snapshot END)`);
 if(rows[0].conflicts)throw Error('Conferência do histórico falhou. Nenhum histórico foi substituído.');
 await client.query(`UPDATE dentec_private.app_state SET payload=jsonb_set(payload,'{calendars}',
 (SELECT coalesce(jsonb_agg(c || jsonb_build_object('versions',
 (SELECT coalesce(jsonb_agg(${metadata('v')} ORDER BY n),'[]'::jsonb)
 FROM jsonb_array_elements(coalesce(c->'versions','[]'::jsonb)) WITH ORDINALITY entries(v,n))) ORDER BY pos),'[]'::jsonb)
 FROM jsonb_array_elements(coalesce(payload->'calendars','[]'::jsonb)) WITH ORDINALITY calendars(c,pos)),true)
 WHERE id=1 AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(payload->'calendars','[]'::jsonb)) c,
 jsonb_array_elements(coalesce(c->'versions','[]'::jsonb)) v WHERE v IS DISTINCT FROM ${metadata('v')})`);
}

export const completeCalendarsSql=`(SELECT coalesce(jsonb_agg(c || jsonb_build_object('versions',
 (SELECT coalesce(jsonb_agg(coalesce(h.snapshot,v) ORDER BY n),'[]'::jsonb)
 FROM jsonb_array_elements(coalesce(c->'versions','[]'::jsonb)) WITH ORDINALITY entries(v,n)
 LEFT JOIN dentec_private.calendar_versions h ON h.calendar_id=c->>'id' AND h.ordinal=n)) ORDER BY pos),'[]'::jsonb)
 FROM jsonb_array_elements(coalesce(payload->'calendars','[]'::jsonb)) WITH ORDINALITY calendars(c,pos))`;
