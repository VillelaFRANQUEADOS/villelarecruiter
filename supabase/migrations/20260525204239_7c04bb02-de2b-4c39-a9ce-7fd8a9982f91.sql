
-- Substituir política de UPDATE: qualquer recrutador/admin pode atualizar qualquer candidato
DROP POLICY IF EXISTS "atualizar candidatos" ON public.candidatos;

CREATE POLICY "atualizar candidatos"
ON public.candidatos
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'recrutador'::app_role)
  OR has_role(auth.uid(), 'agendamento'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'recrutador'::app_role)
  OR has_role(auth.uid(), 'agendamento'::app_role)
);

-- Garantir REPLICA IDENTITY FULL para realtime de updates
ALTER TABLE public.candidatos REPLICA IDENTITY FULL;

-- Adicionar tabela ao publication de realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'candidatos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.candidatos';
  END IF;
END $$;
