ALTER TABLE public.bookings
  ADD COLUMN invite_from text,
  ADD COLUMN delivery_method text NOT NULL DEFAULT 'google_calendar' CHECK (delivery_method IN ('google_calendar', 'gmail')),
  ADD COLUMN email_delivery_status text NOT NULL DEFAULT 'not_sent' CHECK (email_delivery_status IN ('not_sent', 'sending', 'sent', 'uncertain')),
  ADD COLUMN gmail_message_id text;
