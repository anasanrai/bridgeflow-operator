-- Hackathon demo: disable RLS on the 4 pipeline tables so the anon key
-- can write directly. Single-tenant demo project; no auth layer is wired.
-- For a real deployment, replace this with per-table policies or use the
-- service-role key on the backend instead of the anon key.

alter table calls    disable row level security;
alter table analyses disable row level security;
alter table leads    disable row level security;
alter table actions  disable row level security;
