import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateCity } from "@/lib/city-validation";

/**
 * Revalida a cidade de todos os candidatos contra a base oficial IBGE.
 * - Se validar: normaliza para a grafia oficial e limpa `cidade_original_extraida`.
 * - Se não validar: preserva o texto atual em `cidade_original_extraida`, zera código
 *   IBGE e marca `cidade_validada = false` (some do filtro de cidades).
 * Apenas administradores.
 */
export const revalidateAllCities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Acesso negado: apenas administradores podem padronizar cidades.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const PAGE = 500;
    let offset = 0;
    let total = 0;
    let validadas = 0;
    let invalidas = 0;
    let atualizadas = 0;

    // itera em páginas usando range()
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: batch, error } = await supabaseAdmin
        .from("candidatos")
        .select("id,cidade,estado,cidade_original_extraida,codigo_ibge,cidade_validada")
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!batch || batch.length === 0) break;

      for (const row of batch) {
        total++;
        const src = (row.cidade_original_extraida || row.cidade || "").trim();
        const res = validateCity(src, row.estado);

        if (res.cidade_validada) {
          validadas++;
          const changed =
            row.cidade !== res.cidade ||
            row.estado !== res.estado ||
            row.codigo_ibge !== res.codigo_ibge ||
            row.cidade_validada !== true ||
            (row.cidade_original_extraida ?? null) !== null;
          if (changed) {
            const { error: uErr } = await supabaseAdmin
              .from("candidatos")
              .update({
                cidade: res.cidade,
                estado: res.estado,
                codigo_ibge: res.codigo_ibge,
                cidade_validada: true,
                cidade_original_extraida: null,
              })
              .eq("id", row.id);
            if (uErr) throw new Error(uErr.message);
            atualizadas++;
          }
        } else {
          invalidas++;
          const original = row.cidade_original_extraida || row.cidade || null;
          const changed =
            row.cidade_validada !== false ||
            row.codigo_ibge !== null ||
            (row.cidade_original_extraida ?? null) !== (original ?? null) ||
            (res.estado ?? null) !== (row.estado ?? null);
          if (changed) {
            const { error: uErr } = await supabaseAdmin
              .from("candidatos")
              .update({
                cidade: null,
                estado: res.estado,
                codigo_ibge: null,
                cidade_validada: false,
                cidade_original_extraida: original,
              })
              .eq("id", row.id);
            if (uErr) throw new Error(uErr.message);
            atualizadas++;
          }
        }
      }

      if (batch.length < PAGE) break;
      offset += PAGE;
    }

    return { total, validadas, invalidas, atualizadas };
  });
