
ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS origem_curriculo TEXT NOT NULL DEFAULT 'OUTROS',
  ADD COLUMN IF NOT EXISTS cidade_validada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS codigo_ibge TEXT NULL,
  ADD COLUMN IF NOT EXISTS cidade_original_extraida TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'candidatos_origem_curriculo_check'
  ) THEN
    ALTER TABLE public.candidatos
      ADD CONSTRAINT candidatos_origem_curriculo_check
      CHECK (origem_curriculo IN ('LINKEDIN','PANDAPE','INDICACAO','SITE','OUTROS'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS candidatos_cidade_validada_idx
  ON public.candidatos (cidade_validada) WHERE cidade_validada = true;
CREATE INDEX IF NOT EXISTS candidatos_origem_curriculo_idx
  ON public.candidatos (origem_curriculo);
