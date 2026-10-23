-- Let authenticated customer sessions receive rate table change events.
-- Row Level Security still controls which rows each customer can read.
alter publication supabase_realtime add table public.rates;
