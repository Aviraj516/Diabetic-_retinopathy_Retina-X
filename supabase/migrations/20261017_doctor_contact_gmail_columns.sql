-- TRINAY Clinical Ophthalmology Suite
-- Migration: Add Doctor Contact Number and Gmail columns to public.profiles

ALTER TABLE IF EXISTS public.profiles 
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_no TEXT,
  ADD COLUMN IF NOT EXISTS gmail TEXT;

-- Column documentation
COMMENT ON COLUMN public.profiles.phone IS 'Clinician contact phone number';
COMMENT ON COLUMN public.profiles.contact_no IS 'Doctor contact number for clinical communications';
COMMENT ON COLUMN public.profiles.gmail IS 'Clinician Gmail address synchronized via Supabase Google OAuth service';

-- Add search indexes
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_contact_no ON public.profiles(contact_no);
CREATE INDEX IF NOT EXISTS idx_profiles_gmail ON public.profiles(gmail);
