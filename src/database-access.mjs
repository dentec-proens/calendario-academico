import {createHash} from 'node:crypto';
import {relations} from './relational-schema.mjs';

const identifier = value => '"' + value.replaceAll('"', '""') + '"';

// The migration identity runs this SQL. The runtime identity receives data
// privileges only; it cannot create schemas, tables, roles or RLS policies.
export function runtimeAccessSql(role) {
  if (typeof role !== 'string' || !role || role.length > 63) throw Error('Informe uma role PostgreSQL válida em DENTEC_DATABASE_ROLE.');
  const quoted = identifier(role);
  const policy = identifier('backend_' + createHash('sha256').update(role).digest('hex').slice(0,12));
  const tables = ['root_fields', 'record_properties', ...Object.keys(relations)];
  const statements = [
    `GRANT USAGE ON SCHEMA dentec TO ${quoted}`,
    `GRANT USAGE, SELECT ON SEQUENCE dentec.entity_order TO ${quoted}`,
    ...tables.flatMap(table => [
      `GRANT SELECT, INSERT, UPDATE, DELETE ON dentec.${table} TO ${quoted}`,
      `DROP POLICY IF EXISTS ${policy} ON dentec.${table}`,
      `CREATE POLICY ${policy} ON dentec.${table} FOR ALL TO ${quoted} USING (true) WITH CHECK (true)`,
    ]),
    ...['schema_migrations', 'import_history'].flatMap(table => [
      `GRANT SELECT ON dentec.${table} TO ${quoted}`,
      `DROP POLICY IF EXISTS ${policy} ON dentec.${table}`,
      `CREATE POLICY ${policy} ON dentec.${table} FOR SELECT TO ${quoted} USING (true)`,
    ]),
    `GRANT INSERT ON dentec.import_history TO ${quoted}`,
    `DROP POLICY IF EXISTS backend_import ON dentec.import_history`,
    `CREATE POLICY backend_import ON dentec.import_history FOR INSERT TO ${quoted} WITH CHECK (true)`,
  ];
  return statements.join(';\n') + ';\n';
}

export async function configureRuntimeAccess(pool, role) {
  if (!role) return;
  const exists = await pool.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [role]);
  if (!exists.rows.length) throw Error('A role de aplicação configurada em DENTEC_DATABASE_ROLE não existe. Provisione sua credencial antes de migrar.');
  await pool.query(runtimeAccessSql(role));
}

export const restrictApiRolesSql = `DO $private_access$
DECLARE api_role text;
BEGIN
 FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON SCHEMA dentec FROM %I',api_role);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA dentec FROM %I',api_role);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA dentec FROM %I',api_role);
 END LOOP;
END
$private_access$;`;
