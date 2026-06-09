
ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS observacoes_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observacoes_updated_by UUID,
  ADD COLUMN IF NOT EXISTS observacoes_updated_by_nome TEXT;

CREATE OR REPLACE FUNCTION public.set_observacoes_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_nome TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.observacoes IS NOT NULL AND length(btrim(NEW.observacoes)) > 0 THEN
      IF v_uid IS NOT NULL THEN
        SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid;
      END IF;
      NEW.observacoes_updated_at := now();
      NEW.observacoes_updated_by := v_uid;
      NEW.observacoes_updated_by_nome := v_nome;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN
    IF v_uid IS NOT NULL THEN
      SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid;
    END IF;
    NEW.observacoes_updated_at := now();
    NEW.observacoes_updated_by := v_uid;
    NEW.observacoes_updated_by_nome := v_nome;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_observacoes_audit ON public.candidatos;
CREATE TRIGGER trg_set_observacoes_audit
BEFORE INSERT OR UPDATE ON public.candidatos
FOR EACH ROW EXECUTE FUNCTION public.set_observacoes_audit();

DROP POLICY IF EXISTS "admins deletam candidatos" ON public.candidatos;
CREATE POLICY "deletar candidatos" ON public.candidatos
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.has_role(auth.uid(), 'recrutador'::app_role) AND recrutador_id = auth.uid())
  );
