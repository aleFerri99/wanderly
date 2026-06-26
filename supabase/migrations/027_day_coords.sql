-- Coordinate delle tappe (città) per la mappa itinerario:
-- geocodificate una volta e persistite → aperture successive istantanee.
ALTER TABLE public.days ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.days ADD COLUMN IF NOT EXISTS lng double precision;
