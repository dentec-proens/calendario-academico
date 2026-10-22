-- Preserve all legacy rows as a migration archive. The application role must
-- use only the relational schema after the verified import has completed.
DO $retire_legacy$
BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='dentec_test_app')
    AND EXISTS (SELECT FROM pg_namespace WHERE nspname='dentec_private') THEN
  REVOKE ALL ON SCHEMA dentec_private FROM dentec_test_app;
  REVOKE ALL ON ALL TABLES IN SCHEMA dentec_private FROM dentec_test_app;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA dentec_private FROM dentec_test_app;
 END IF;
END
$retire_legacy$;
