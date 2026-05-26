
-- 1. Renomear enum antigo
ALTER TYPE public.candidato_status RENAME TO candidato_status_old;

-- 2. Criar novo enum
CREATE TYPE public.candidato_status AS ENUM (
  'triagem',
  'aguardando_contato',
  'remarcar',
  'sem_interesse',
  'agendado'
);

-- 3. Atualizar coluna para novo tipo, mapeando compareceu/contratado -> agendado
ALTER TABLE public.candidatos
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.candidatos
  ALTER COLUMN status TYPE public.candidato_status
  USING (
    CASE status::text
      WHEN 'compareceu' THEN 'agendado'
      WHEN 'contratado' THEN 'agendado'
      ELSE status::text
    END
  )::public.candidato_status;

ALTER TABLE public.candidatos
  ALTER COLUMN status SET DEFAULT 'triagem'::public.candidato_status;

-- 4. Remover enum antigo
DROP TYPE public.candidato_status_old;
