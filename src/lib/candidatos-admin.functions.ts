import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
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

// ================== PADRONIZAÇÃO DE NOMES A PARTIR DO PDF ==================

const GATEWAY_DRIVE = "https://connector-gateway.lovable.dev/google_drive";

async function downloadFromDriveAdmin(fileId: string): Promise<{ base64: string; mimeType: string }> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY ausente");
  const res = await fetch(`${GATEWAY_DRIVE}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
    },
  });
  if (!res.ok) throw new Error(`Drive ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "application/pdf";
  const arr = await res.arrayBuffer();
  return { base64: Buffer.from(arr).toString("base64"), mimeType };
}

const NAME_SCHEMA = z.object({ nome: z.string() });

const NAME_PROMPT =
  "Você extrai o NOME COMPLETO da PESSOA candidata a partir do currículo em anexo. " +
  "Regras: 1) Retorne EXCLUSIVAMENTE o nome próprio da pessoa (mínimo nome + sobrenome). " +
  "2) NUNCA use nome de empresa, escola, cargo, agência, sistema (Pandapé, Grupo Villela, Impressão CV). " +
  "3) Se o documento não contiver um nome de pessoa identificável, retorne string vazia \"\". " +
  "4) NÃO invente. Sem pontuação extra, sem títulos (Sr., Dr., etc.). Capitalize corretamente.";

const NAME_BLOCK_RE =
  /^(grupo\s+villela|impress[aã]o\s+cv|pandap[eé]|curriculum|curr[ií]culo|dados\s+pessoais|contato)/i;

function nameLooksValid(n: string): boolean {
  const t = n.trim();
  if (!t) return false;
  if (NAME_BLOCK_RE.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  // rejeita se tiver dígitos ou caracteres esquisitos
  if (/[\d@_/\\]/.test(t)) return false;
  return true;
}

function titleCaseName(n: string): string {
  return n
    .trim()
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase();
      // preposições em minúsculas quando no meio do nome
      if (["de", "da", "do", "das", "dos", "e"].includes(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Processa um lote de candidatos, extraindo o nome a partir do PDF no Drive
 * e atualizando quando o nome extraído for válido e diferente.
 * Usa `ultimo_reprocessamento_at` como marcador de progresso: só processa
 * candidatos cujo `ultimo_reprocessamento_at` seja NULL ou menor que `startedAt`.
 * Chame em loop até `remaining === 0`.
 */
export const revalidateNamesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { startedAt: string; limit?: number }) =>
    z.object({ startedAt: z.string().datetime(), limit: z.number().int().min(1).max(20).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: adminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Acesso negado: apenas administradores podem padronizar nomes.");

    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY ausente");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 5;

    // Candidatos ainda não processados nesta rodada
    const { data: batch, error } = await supabaseAdmin
      .from("candidatos")
      .select("id,nome,curriculo_url,ultimo_reprocessamento_at")
      .like("curriculo_url", "drive:%")
      .or(`ultimo_reprocessamento_at.is.null,ultimo_reprocessamento_at.lt.${data.startedAt}`)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);

    const changes: Array<{ id: string; from: string; to: string }> = [];
    let processed = 0;
    let updated = 0;
    let failed = 0;

    for (const row of batch ?? []) {
      processed++;
      const nowIso = new Date().toISOString();
      try {
        const fileId = String(row.curriculo_url).slice(6);
        const { base64, mimeType } = await downloadFromDriveAdmin(fileId);

        type Part =
          | { type: "text"; text: string }
          | { type: "file"; data: string; mediaType: string }
          | { type: "image"; image: string };
        const parts: Part[] = [{ type: "text", text: NAME_PROMPT }];
        if (mimeType.startsWith("image/")) {
          parts.push({ type: "image", image: `data:${mimeType};base64,${base64}` });
        } else {
          parts.push({ type: "file", data: base64, mediaType: mimeType });
        }

        const { object } = await generateObject({
          model: google("gemini-2.5-flash"),
          schema: NAME_SCHEMA,
          messages: [{ role: "user", content: parts as unknown as never }],
        });

        const raw = (object.nome || "").trim();
        if (nameLooksValid(raw)) {
          const normalized = titleCaseName(raw);
          const current = (row.nome || "").trim();
          if (normalized && normalized.toLowerCase() !== current.toLowerCase()) {
            const { error: uErr } = await supabaseAdmin
              .from("candidatos")
              .update({ nome: normalized, ultimo_reprocessamento_at: nowIso })
              .eq("id", row.id);
            if (uErr) throw new Error(uErr.message);
            updated++;
            changes.push({ id: row.id, from: current, to: normalized });
            continue;
          }
        }
        // sem mudança: apenas marca como processado
        await supabaseAdmin
          .from("candidatos")
          .update({ ultimo_reprocessamento_at: nowIso })
          .eq("id", row.id);
      } catch {
        failed++;
        await supabaseAdmin
          .from("candidatos")
          .update({ ultimo_reprocessamento_at: nowIso })
          .eq("id", row.id);
      }
    }

    // Quantos ainda restam após este lote
    const { count } = await supabaseAdmin
      .from("candidatos")
      .select("id", { count: "exact", head: true })
      .like("curriculo_url", "drive:%")
      .or(`ultimo_reprocessamento_at.is.null,ultimo_reprocessamento_at.lt.${data.startedAt}`);

    return { processed, updated, failed, remaining: count ?? 0, changes };
  });

