
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS estado TEXT;

CREATE INDEX IF NOT EXISTS idx_candidatos_estado ON public.candidatos(estado);
CREATE INDEX IF NOT EXISTS idx_candidatos_recrutador_created ON public.candidatos(recrutador_id, created_at DESC);
