
-- 1. Novas colunas em candidatos
ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS sharepoint_item_id text,
  ADD COLUMN IF NOT EXISTS sharepoint_etag text,
  ADD COLUMN IF NOT EXISTS sharepoint_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS candidatos_sharepoint_item_id_uidx
  ON public.candidatos (sharepoint_item_id) WHERE sharepoint_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS candidatos_not_deleted_idx
  ON public.candidatos (created_at DESC) WHERE deleted_at IS NULL;

-- 2. sharepoint_config (linha única)
CREATE TABLE IF NOT EXISTS public.sharepoint_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  site_id text,
  site_url text,
  site_name text,
  list_id text,
  list_name text,
  last_delta_link text,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_message text,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sharepoint_config TO authenticated;
GRANT ALL ON public.sharepoint_config TO service_role;
ALTER TABLE public.sharepoint_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sharepoint_config admin read" ON public.sharepoint_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sharepoint_config admin write" ON public.sharepoint_config
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. sharepoint_outbox (fila de push)
CREATE TABLE IF NOT EXISTS public.sharepoint_outbox (
  id bigserial PRIMARY KEY,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  op text NOT NULL CHECK (op IN ('upsert','delete')),
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX IF NOT EXISTS sharepoint_outbox_pending_idx ON public.sharepoint_outbox (created_at) WHERE attempts < 5;
CREATE INDEX IF NOT EXISTS sharepoint_outbox_candidato_idx ON public.sharepoint_outbox (candidato_id);
GRANT SELECT ON public.sharepoint_outbox TO authenticated;
GRANT ALL ON public.sharepoint_outbox TO service_role;
ALTER TABLE public.sharepoint_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sharepoint_outbox admin read" ON public.sharepoint_outbox
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. sharepoint_sync_log
CREATE TABLE IF NOT EXISTS public.sharepoint_sync_log (
  id bigserial PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('push','pull')),
  candidato_id uuid,
  sharepoint_item_id text,
  action text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sharepoint_sync_log_created_idx ON public.sharepoint_sync_log (created_at DESC);
GRANT SELECT ON public.sharepoint_sync_log TO authenticated;
GRANT ALL ON public.sharepoint_sync_log TO service_role;
ALTER TABLE public.sharepoint_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sharepoint_sync_log admin read" ON public.sharepoint_sync_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. Trigger de outbox
CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT enabled INTO v_enabled FROM public.sharepoint_config WHERE id = true;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      INSERT INTO public.sharepoint_outbox (candidato_id, op) VALUES (NEW.id, 'upsert');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL) THEN
    INSERT INTO public.sharepoint_outbox (candidato_id, op) VALUES (NEW.id, 'delete');
    RETURN NEW;
  END IF;

  -- Ignorar updates que vieram do próprio pull (sharepoint_synced_at mudou e nada mais relevante)
  IF NEW.sharepoint_synced_at IS DISTINCT FROM OLD.sharepoint_synced_at
     AND NEW.nome IS NOT DISTINCT FROM OLD.nome
     AND NEW.telefone IS NOT DISTINCT FROM OLD.telefone
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.cidade IS NOT DISTINCT FROM OLD.cidade
     AND NEW.estado IS NOT DISTINCT FROM OLD.estado
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.observacoes IS NOT DISTINCT FROM OLD.observacoes
     AND NEW.origem_curriculo IS NOT DISTINCT FROM OLD.origem_curriculo
     AND NEW.vaga IS NOT DISTINCT FROM OLD.vaga
     AND NEW.recrutador_id IS NOT DISTINCT FROM OLD.recrutador_id
     AND NEW.data_entrevista IS NOT DISTINCT FROM OLD.data_entrevista
     AND NEW.horario_entrevista IS NOT DISTINCT FROM OLD.horario_entrevista THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NULL THEN
    INSERT INTO public.sharepoint_outbox (candidato_id, op) VALUES (NEW.id, 'upsert');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_sharepoint_sync ON public.candidatos;
CREATE TRIGGER trg_enqueue_sharepoint_sync
  AFTER INSERT OR UPDATE ON public.candidatos
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_sharepoint_sync();

-- 6. Extensões para cron/hook
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
