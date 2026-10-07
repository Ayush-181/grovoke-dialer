ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS invite_from text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'google_calendar';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS email_delivery_status text NOT NULL DEFAULT 'not_sent';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS gmail_message_id text;