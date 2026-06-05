ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS data_entrevista date,
  ADD COLUMN IF NOT EXISTS horario_entrevista time,
  ADD COLUMN IF NOT EXISTS entrevistador text;

CREATE INDEX IF NOT EXISTS candidatos_data_entrevista_idx ON public.candidatos(data_entrevista);
CREATE INDEX IF NOT EXISTS candidatos_entrevistador_idx ON public.candidatos(entrevistador);