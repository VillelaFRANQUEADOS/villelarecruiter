CREATE TABLE public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cidade TEXT NOT NULL,
  estado TEXT NOT NULL,
  endereco TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX unidades_nome_cidade_estado_key ON public.unidades (lower(nome), lower(cidade), upper(estado));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read unidades" ON public.unidades
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage unidades" ON public.unidades
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_unidades_updated BEFORE UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.unidades (nome, cidade, estado, latitude, longitude) VALUES
('Barreiras - BA','Barreiras','BA',-12.1503043,-44.9910015),
('Angra dos Reis 2 - RJ','Angra dos Reis','RJ',-22.9439049,-44.3268986),
('Barueri - SP','Barueri','SP',-23.5010402,-46.8418617),
('Bauru - SP','Bauru','SP',-22.3630794,-49.05564829999999),
('Belo Horizonte - MG','Belo Horizonte','MG',-19.967583,-43.9550586),
('Cascavel - PR','Cascavel','PR',-24.9558208,-53.4603593),
('Campinas - SP','Campinas','SP',-22.9533819,-47.0619704),
('Campo Grande - MS','Campo Grande','MS',-20.4574784,-54.58310059999999),
('Chapecó/SC','Chapecó','SC',-27.0934577,-52.58422239999999),
('Curitiba 1 - PR','Curitiba','PR',-25.4336957,-49.3014446),
('Curitiba 2 - PR','Curitiba','PR',-25.4334446,-49.2708546),
('Cuiabá - MT','Cuiabá','MT',-15.5822704,-56.076962),
('Fortaleza - CE','Fortaleza','CE',-3.744682199999999,-38.4730944),
('Florianópolis 1 - SC','Florianópolis','SC',-27.5420033,-48.504934),
('Goiânia 1 - GO','Goiânia','GO',-16.7159962,-49.2742993),
('Goiânia 2 - GO','Goiânia','GO',-16.695616,-49.2917425),
('Itajaí 2 - SC','Itajaí','SC',-26.9523187,-48.6397494),
('Jundiaí - SP','Jundiaí','SP',-23.2023918,-46.8921076),
('Niterói - RJ','Niterói','RJ',-22.9248158,-43.0934103),
('Natal - RN','Natal','RN',-5.7937017,-35.2018812),
('Nova Lima - MG','Nova Lima','MG',-19.9871196,-43.94598269999999),
('Manaus - AM','Manaus','AM',-3.101348499999999,-60.0246931),
('Palhoça - SC','Palhoça','SC',-27.6452446,-48.6685422),
('Piracicaba - SP','Piracicaba','SP',-22.7330947,-47.6378037),
('Porto Alegre 1 - RS','Porto Alegre','RS',-30.0792689,-51.2437731),
('Porto Alegre 2 - RS','Porto Alegre','RS',-30.0624855,-51.2308216),
('Ribeirão Preto - SP','Ribeirão Preto','SP',-21.2085138,-47.7943216),
('Recife - PE','Recife','PE',-8.0652972,-34.8962521),
('Rio de Janeiro 1 - RJ','Rio de Janeiro','RJ',-22.9884887,-43.3591793),
('São Leopoldo - RS','São Leopoldo','RS',-29.7673739,-51.1478723),
('São José dos Campos - SP','São José dos Campos','SP',-23.2121148,-45.9089483),
('São Paulo - SP','São Paulo','SP',-23.5598481,-46.6570106),
('Santos - SP','Santos','SP',-23.9530233,-46.322784),
('Salvador 1 - BA','Salvador','BA',-12.981328,-38.45422670000001),
('Salvador 2 - BA','Salvador','BA',-12.979938,-38.4520381),
('Sinop - MT','Sinop','MT',-11.8573556,-55.5064596),
('Vitória - ES','Vitória','ES',-20.2980226,-40.3004481),
('Vilhena - RO','Vilhena','RO',-12.7405588,-60.14459829999999),
('SOROCABA - SP','SOROCABA','SP',-23.476178,-47.4270013);