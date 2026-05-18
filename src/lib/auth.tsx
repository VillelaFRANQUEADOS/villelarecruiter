import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadMeta(s.user.id), 0);
      } else {
        setRole(null); setNome(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadMeta(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadMeta(userId: string) {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);
    setNome(p?.nome ?? null);
    setRole((r?.role as AppRole) ?? null);
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

export const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  triagem: "Triagem",
  aguardando_contato: "Aguardando contato",
  agendado: "Agendado",
  compareceu: "Compareceu",
  reprovado: "Reprovado",
  contratado: "Contratado",
};

export const STATUS_ORDER = [
  "novo", "triagem", "aguardando_contato", "agendado", "compareceu", "reprovado", "contratado",
] as const;

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  agendamento: "Agendamento",
  recrutador: "Recrutador",
};
