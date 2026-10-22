-- Dedicated test project only. The password is provisioned separately and is
-- never included in migration history or source control.
DO $role$
BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dentec_test_app') THEN
  CREATE ROLE dentec_test_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
END
$role$;

ALTER ROLE dentec_test_app SET search_path = pg_catalog;
GRANT CONNECT ON DATABASE postgres TO dentec_test_app;
GRANT USAGE ON SCHEMA dentec_private TO dentec_test_app;
GRANT SELECT, UPDATE ON dentec_private.app_state TO dentec_test_app;
GRANT SELECT, INSERT ON dentec_private.calendar_versions TO dentec_test_app;
GRANT SELECT, INSERT ON dentec_private.history_migration_backups TO dentec_test_app;

-- This server identity represents the application's backend, whose API checks
-- account roles and campus ownership. Browser/API roles receive no policy.
CREATE POLICY dentec_test_backend_read ON dentec_private.app_state
 FOR SELECT TO dentec_test_app USING (true);
CREATE POLICY dentec_test_backend_write ON dentec_private.app_state
 FOR UPDATE TO dentec_test_app USING (true) WITH CHECK (true);
CREATE POLICY dentec_test_backend_read ON dentec_private.calendar_versions
 FOR SELECT TO dentec_test_app USING (true);
CREATE POLICY dentec_test_backend_archive ON dentec_private.calendar_versions
 FOR INSERT TO dentec_test_app WITH CHECK (true);
CREATE POLICY dentec_test_backend_read ON dentec_private.history_migration_backups
 FOR SELECT TO dentec_test_app USING (true);
CREATE POLICY dentec_test_backend_backup ON dentec_private.history_migration_backups
 FOR INSERT TO dentec_test_app WITH CHECK (true);
