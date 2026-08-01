-- Makes audit_log genuinely append-only: even the app_worker role (see
-- db/setup/roles.sql) can INSERT but can never UPDATE or DELETE existing
-- rows, so it stays trustworthy for dispute/fraud investigation.

create or replace function reject_audit_log_mutation()
returns trigger as $$
begin
  raise exception 'audit_log is append-only';
end;
$$ language plpgsql;

create trigger audit_log_no_update
  before update on audit_log
  for each row execute function reject_audit_log_mutation();

create trigger audit_log_no_delete
  before delete on audit_log
  for each row execute function reject_audit_log_mutation();
