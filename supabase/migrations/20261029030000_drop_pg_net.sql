-- Leftover from the old spy job; its worker held long transactions and starved the DB.
drop extension if exists pg_net cascade;
