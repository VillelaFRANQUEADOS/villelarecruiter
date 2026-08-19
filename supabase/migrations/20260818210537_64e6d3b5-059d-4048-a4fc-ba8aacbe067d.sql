-- Separa "quem alterou o status" (candidato_status_log.changed_by_nome) de
-- "quem efetivamente realizou o agendamento" (candidatos.agendado_por_*).
--
-- candidato_status_log continua registrando toda alteração de status,
-- feita por qualquer usuário, sem nenhuma mudança de comportamento.
--
-- Estes três campos novos só devem ser preenchidos/alterados explicitamente
-- pela tela de agendamento (AgendarEntrevistaDialog) ou pela edição de
-- candidato quando o candidato ainda não possui um responsável pelo
-- agendamento. Uma edição posterior feita por outra pessoa NÃO deve
-- sobrescrever esses campos - isso é responsabilidade da aplicação
-- (o front-end simplesmente não envia esses campos quando já preenchidos).

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS agendado_por_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agendado_por_nome TEXT NULL,
  ADD COLUMN IF NOT EXISTS agendado_em TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_candidatos_agendado_por_id ON public.candidatos(agendado_por_id);

-- Acelera a consulta principal da aba Agendamentos (status = 'agendado',
-- ordenado por data + hora).
CREATE INDEX IF NOT EXISTS idx_candidatos_agendado_data_hora
  ON public.candidatos(data_entrevista, horario_entrevista)
  WHERE status = 'agendado';
