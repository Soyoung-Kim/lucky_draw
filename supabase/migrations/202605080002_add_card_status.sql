-- Add card_status column to draw_cards table
alter table public.draw_cards
add column card_status text not null default 'unrevealed',
add constraint draw_cards_card_status_check check (
  card_status in ('unrevealed', 'revealed', 'absent', 'claimed', 'withdrawn')
);

-- Create index for efficient status filtering
create index if not exists draw_cards_draw_id_status_idx
on public.draw_cards (draw_id, card_status);

-- Update existing records based on is_revealed value
update public.draw_cards
set card_status = 'revealed'
where is_revealed = true;

-- Add comment for clarity
comment on column public.draw_cards.card_status is
'Status of the card: unrevealed (not drawn), revealed (drawn and available), absent (drawn but not present), claimed (received prize), withdrawn (abstained/left)';
