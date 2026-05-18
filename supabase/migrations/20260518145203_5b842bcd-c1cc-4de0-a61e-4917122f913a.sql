
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'agendamento', 'recrutador');
CREATE TYPE public.candidato_status AS ENUM ('novo', 'triagem', 'aguardando_contato', 'agendado', 'compareceu', 'reprovado', 'contratado');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Candidatos
CREATE TABLE public.candidatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  cidade TEXT NOT NULL,
  regiao TEXT NOT NULL,
  vaga TEXT NOT NULL,
  status candidato_status NOT NULL DEFAULT 'novo',
  observacoes TEXT,
  curriculo_url TEXT,
  recrutador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_candidatos_updated BEFORE UPDATE ON public.candidatos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'perfil')::app_role, 'recrutador'));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS policies: profiles
CREATE POLICY "profiles viewable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "admins manage profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies: user_roles
CREATE POLICY "user_roles viewable by authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies: candidatos
CREATE POLICY "candidatos viewable by authenticated" ON public.candidatos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "recrutadores e admins criam candidatos" ON public.candidatos
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'recrutador') OR
    public.has_role(auth.uid(), 'agendamento')
  );
CREATE POLICY "atualizar candidatos" ON public.candidatos
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'agendamento') OR
    (public.has_role(auth.uid(), 'recrutador') AND recrutador_id = auth.uid())
  );
CREATE POLICY "admins deletam candidatos" ON public.candidatos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('curriculos', 'curriculos', false);

CREATE POLICY "authenticated can read curriculos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'curriculos');
CREATE POLICY "authenticated can upload curriculos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'curriculos');
CREATE POLICY "authenticated can update curriculos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'curriculos');
CREATE POLICY "admins can delete curriculos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'curriculos' AND public.has_role(auth.uid(), 'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.candidatos;
ALTER TABLE public.candidatos REPLICA IDENTITY FULL;
