
CREATE TABLE public.candidato_status_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidato_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  status_anterior public.candidato_status,
  status_novo public.candidato_status NOT NULL,
  changed_by UUID,
  changed_by_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_log_candidato ON public.candidato_status_log(candidato_id, created_at DESC);
CREATE INDEX idx_status_log_changed_by ON public.candidato_status_log(changed_by);

GRANT SELECT, INSERT ON public.candidato_status_log TO authenticated;
GRANT ALL ON public.candidato_status_log TO service_role;

ALTER TABLE public.candidato_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view status log"
ON public.candidato_status_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'recrutador'::app_role)
  OR public.has_role(auth.uid(), 'agendamento'::app_role)
);

CREATE POLICY "staff insert status log"
ON public.candidato_status_log FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'recrutador'::app_role)
  OR public.has_role(auth.uid(), 'agendamento'::app_role)
);

CREATE OR REPLACE FUNCTION public.log_candidato_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_nome TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid;
  END IF;

  INSERT INTO public.candidato_status_log (candidato_id, status_anterior, status_novo, changed_by, changed_by_nome)
  VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    v_uid,
    v_nome
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_candidato_status ON public.candidatos;
CREATE TRIGGER trg_log_candidato_status
AFTER INSERT OR UPDATE OF status ON public.candidatos
FOR EACH ROW EXECUTE FUNCTION public.log_candidato_status_change();

ALTER PUBLICATION supabase_realtime ADD TABLE public.candidato_status_log;
ALTER TABLE public.candidato_status_log REPLICA IDENTITY FULL;
