-- Run as a PostgreSQL administrator after replacing passwords through a secret manager.
-- Do not use these roles as database owners or superusers.
CREATE ROLE careorbit_migrator LOGIN PASSWORD 'replace-migrator-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE careorbit_app LOGIN PASSWORD 'replace-app-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE careorbit TO careorbit_migrator, careorbit_app;
GRANT USAGE, CREATE ON SCHEMA public TO careorbit_migrator;
GRANT USAGE ON SCHEMA public TO careorbit_app;

-- Run these grants after every migration, or configure equivalent default privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE careorbit_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO careorbit_app;
ALTER DEFAULT PRIVILEGES FOR ROLE careorbit_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO careorbit_app;
