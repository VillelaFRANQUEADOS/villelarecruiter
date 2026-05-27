
-- Recreate enum without 'remarcar'
ALTER TYPE public.candidato_status RENAME TO candidato_status_old;

CREATE TYPE public.candidato_status AS ENUM (
  'aguardando_contato',
  'aguardando_retorno',
  'sem_interesse',
  'agendado'
);

ALTER TABLE public.candidatos ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.candidatos
  ALTER COLUMN status TYPE public.candidato_status
  USING (
    CASE status::text
      WHEN 'remarcar' THEN 'aguardando_retorno'
      ELSE status::text
    END
  )::public.candidato_status;

ALTER TABLE public.candidatos
  ALTER COLUMN status SET DEFAULT 'aguardando_contato'::public.candidato_status;

DROP TYPE public.candidato_status_old;

-- Realtime: full row payloads + add to publication
ALTER TABLE public.candidatos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.candidatos;
