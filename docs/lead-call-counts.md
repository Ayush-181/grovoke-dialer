# Lead call counts

Apply `drizzle/migrations/0005_lead_call_counts.sql` in Lovable's database migration workflow, then publish the frontend update. This migration backfills zero/missing counts from existing outbound call logs and installs an atomic insert trigger for future calls. Publishing only the frontend does not install this trigger.

The Calls column counts recorded outbound attempts, including busy and unanswered calls. Changing an outcome, duration, or recording does not add another call. Inbound calls and calls without a linked lead do not count. Deleting a call log preserves the cumulative counter. The backfill never reduces an existing counter. Calls whose logs have already been deleted cannot be reconstructed.

The dialer refreshes the Leads query after logging an outbound call, so the visible count updates without reloading the page. The Never called checkbox continues to filter missing outcomes independently of the counter.

Run `psql -v ON_ERROR_STOP=1 -f tests/lead-call-counts.sql` against an empty disposable PostgreSQL database for the migration regression checks. The fixture rolls back its objects and covers backfill, repeat deployment, outbound attempts, outcome edits, inbound/unlinked calls, workspace isolation, rollback, and cumulative history.
