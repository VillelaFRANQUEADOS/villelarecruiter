
-- 1. New enum
CREATE TYPE candidato_status_new AS ENUM (
  'triagem','aguardando_contato','remarcar','sem_interesse','agendado','compareceu','contratado'
);

-- 2. Drop default before type swap
ALTER TABLE public.candidatos ALTER COLUMN status DROP DEFAULT;

-- 3. Convert column with mapping
ALTER TABLE public.candidatos
  ALTER COLUMN status TYPE candidato_status_new
  USING (
    CASE status::text
      WHEN 'novo' THEN 'triagem'
      WHEN 'reprovado' THEN 'sem_interesse'
      ELSE status::text
    END
  )::candidato_status_new;

-- 4. Swap types
DROP TYPE candidato_status;
ALTER TYPE candidato_status_new RENAME TO candidato_status;

-- 5. New default
ALTER TABLE public.candidatos ALTER COLUMN status SET DEFAULT 'triagem'::candidato_status;

-- 6. New columns + relax required ones
ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS experiencias text;

ALTER TABLE public.candidatos ALTER COLUMN regiao DROP NOT NULL;
ALTER TABLE public.candidatos ALTER COLUMN vaga DROP NOT NULL;
ALTER TABLE public.candidatos ALTER COLUMN cidade DROP NOT NULL;
ALTER TABLE public.candidatos ALTER COLUMN telefone DROP NOT NULL;

-- 7. Indexes for search
CREATE INDEX IF NOT EXISTS idx_candidatos_nome ON public.candidatos (lower(nome));
CREATE INDEX IF NOT EXISTS idx_candidatos_telefone ON public.candidatos (telefone);
CREATE INDEX IF NOT EXISTS idx_candidatos_cidade ON public.candidatos (lower(cidade));
CREATE INDEX IF NOT EXISTS idx_candidatos_status ON public.candidatos (status);

-- 8. Storage policies for 'curriculos' bucket
DROP POLICY IF EXISTS "auth read curriculos" ON storage.objects;
DROP POLICY IF EXISTS "auth upload curriculos" ON storage.objects;
DROP POLICY IF EXISTS "auth update curriculos" ON storage.objects;
DROP POLICY IF EXISTS "auth delete curriculos" ON storage.objects;

CREATE POLICY "auth read curriculos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'curriculos');

CREATE POLICY "auth upload curriculos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'curriculos');

CREATE POLICY "auth update curriculos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'curriculos');

CREATE POLICY "auth delete curriculos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'curriculos');
