-- Add user profile/preferences JSON
ALTER TABLE app."User"
ADD COLUMN IF NOT EXISTS "profile" jsonb;
