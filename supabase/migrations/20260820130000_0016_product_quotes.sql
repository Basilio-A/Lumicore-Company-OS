-- Per-product dashboard quotes (3 slots: text + author).
alter table public.products
  add column if not exists quotes jsonb not null default '[
    {"text":"The best way to predict the future is to invent it.","author":"Alan Kay"},
    {"text":"Done is better than perfect.","author":"Sheryl Sandberg"},
    {"text":"Make it simple, but significant.","author":"Don Draper"}
  ]'::jsonb;
