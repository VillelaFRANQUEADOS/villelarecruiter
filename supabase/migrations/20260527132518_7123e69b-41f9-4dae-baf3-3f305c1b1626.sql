
-- Recreate enum without 'triagem', with 'aguardando_retorno'
ALTER TYPE public.candidato_status RENAME TO candidato_status_old;

CREATE TYPE public.candidato_status AS ENUM (
  'aguardando_contato',
  'aguardando_retorno',
  'remarcar',
  'sem_interesse',
  'agendado'
);

ALTER TABLE public.candidatos ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.candidatos
  ALTER COLUMN status TYPE public.candidato_status
  USING (
    CASE status::text
      WHEN 'triagem' THEN 'aguardando_contato'
      ELSE status::text
    END
  )::public.candidato_status;

ALTER TABLE public.candidatos
  ALTER COLUMN status SET DEFAULT 'aguardando_contato'::public.candidato_status;

DROP TYPE public.candidato_status_old;
