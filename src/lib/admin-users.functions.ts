import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

type AppRole = "admin" | "recrutador";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: somente administradores");
}

export interface AdminUserRow { id:string; email:string; nome:string; role:AppRole | null; ativo:boolean; created_at:string; last_sign_in_at:string | null; }

export const listUsers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<AdminUserRow[]> => { await assertAdmin(context.userId); const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 }); if (error) throw new Error(error.message); const ids = users.users.map((u) => u.id); const [{ data: profs }, { data: roles }] = await Promise.all([supabaseAdmin.from("profiles").select("id,nome,ativo").in("id", ids), supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids)]); const pMap = new Map((profs ?? []).map((p) => [p.id, p])); const rMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole])); return users.users.map((u) => { const p = pMap.get(u.id); return { id:u.id,email:u.email ?? "",nome:p?.nome ?? (u.email?.split("@")[0] ?? ""),role:rMap.get(u.id) ?? null,ativo:p?.ativo ?? true,created_at:u.created_at,last_sign_in_at:u.last_sign_in_at ?? null};}).sort((a,b)=>a.nome.localeCompare(b.nome));});

export const updateUserName = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((i) => z.object({ userId: z.string().uuid(), nome: z.string().min(1).max(120) }).parse(i))
.handler(async ({ data, context }) => {
  await assertAdmin(context.userId);
  const { error } = await supabaseAdmin.from("profiles").update({ nome: data.nome }).eq("id", data.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
});
