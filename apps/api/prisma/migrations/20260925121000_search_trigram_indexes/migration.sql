-- §56 search relies on pg_trgm (`%`, similarity()). Creating the extension here means a fresh database
-- works without manual prep (a no-op where it already exists). Trigram GIN indexes keep fuzzy search fast.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "events_title_trgm_idx" ON "events" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "events_description_trgm_idx" ON "events" USING gin ("description" gin_trgm_ops);
