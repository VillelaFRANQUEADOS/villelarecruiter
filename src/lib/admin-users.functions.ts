import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

type AppRole = "admin" | "recrutador";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: somente administradores");
}

export interface AdminUserRow {
  id: string;
  email: string;
  nome: string;
  role: AppRole | null;
  ativo: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context.userId);
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);
    const ids = users.users.map((u) => u.id);
    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,nome,ativo").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids),
    ]);
    const pMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const rMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));
    return users.users.map((u) => {
      const p = pMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        nome: p?.nome ?? (u.email?.split("@")[0] ?? ""),
        role: rMap.get(u.id) ?? null,
        ativo: p?.ativo ?? true,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome));
  });

const CreateSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(1).max(120),
  senha: z.string().min(6).max(72),
  role: z.enum(["admin", "recrutador"]),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => CreateSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome, perfil: data.role },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    // upsert profile / role (trigger may also create them)
    await supabaseAdmin.from("profiles").upsert({ id: uid, nome: data.nome, email: data.email, ativo: true });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    return { id: uid };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), role: z.enum(["admin", "recrutador"]) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("Você não pode remover seu próprio acesso de admin");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), ativo: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId && !data.ativo) {
      throw new Error("Você não pode desativar a si mesmo");
    }
    const { error } = await supabaseAdmin.from("profiles").update({ ativo: data.ativo }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    // bloquear/desbloquear login
    const banDuration = data.ativo ? "none" : "876000h";
    const { error: e2 } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: banDuration });
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), novaSenha: z.string().min(6).max(72) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.novaSenha });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a si mesmo");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
