import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "agendamento" | "recrutador";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  nome: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, role: null, nome: null, loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLoadedUserId = useRef<string | null>(null);
  const metaRequestRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => { void loadMeta(s.user.id); }, 0);
      } else {
        lastLoadedUserId.current = null;
        setRole(null); setNome(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        void loadMeta(data.session.user.id);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadMeta(userId: string) {
    if (lastLoadedUserId.current === userId) return;
    if (metaRequestRef.current) {
      await metaRequestRef.current;
      if (lastLoadedUserId.current === userId) return;
    }

    metaRequestRef.current = (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("nome,ativo").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      ]);
      if (p && p.ativo === false) {
        await supabase.auth.signOut();
        lastLoadedUserId.current = null;
        setNome(null); setRole(null);
        if (typeof window !== "undefined") {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { toast } = await import("sonner");
          toast.error("Usuário desativado. Contate um administrador.");
        }
        return;
      }
      lastLoadedUserId.current = userId;
      setNome(p?.nome ?? null);
      setRole((r?.role as AppRole) ?? null);
    })();


    try {
      await metaRequestRef.current;
    } finally {
      metaRequestRef.current = null;
    }
  }

  return (
    <Ctx.Provider value={{
      user: session?.user ?? null,
      session, role, nome, loading,
      signOut: async () => { await supabase.auth.signOut(); },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export type CandidatoStatus =
  | "aguardando_contato"
  | "aguardando_retorno"
  | "sem_interesse"
  | "agendado";

export const STATUS_LABELS: Record<CandidatoStatus, string> = {
  aguardando_contato: "Aguardando contato",
  aguardando_retorno: "Aguardando retorno",
  sem_interesse: "Sem interesse",
  agendado: "Agendado",
};

export const STATUS_ORDER: CandidatoStatus[] = [
  "aguardando_contato",
  "aguardando_retorno",
  "sem_interesse",
  "agendado",
];

export const STATUS_TONE: Record<CandidatoStatus, string> = {
  aguardando_contato: "bg-warning/15 text-warning border-0 rounded-full px-3",
  aguardando_retorno: "bg-accent text-accent-foreground border-0 rounded-full px-3",
  sem_interesse: "bg-destructive/10 text-destructive border-0 rounded-full px-3",
  agendado: "bg-success/15 text-success border-0 rounded-full px-3",
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  agendamento: "Agendamento",
  recrutador: "Recrutador",
};

export interface CandidatoRow {
  id: string;
  nome: string;
  telefone: string;
  cidade: string;
  estado: string | null;
  regiao: string | null;
  vaga: string | null;
  email: string | null;
  experiencias: string | null;
  status: CandidatoStatus;
  observacoes: string | null;
  observacoes_updated_at: string | null;
  observacoes_updated_by: string | null;
  observacoes_updated_by_nome: string | null;
  curriculo_url: string | null;
  recrutador_id: string | null;
  created_at: string;
  data_entrevista: string | null;
  horario_entrevista: string | null;
  entrevistador: string | null;
  ultimo_reprocessamento_at: string | null;
  origem_curriculo: string;
  cidade_validada: boolean;
  codigo_ibge: string | null;
  cidade_original_extraida: string | null;
}

export const UF_LIST: string[] = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

