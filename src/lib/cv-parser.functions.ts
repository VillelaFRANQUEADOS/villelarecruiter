import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { generateObject } from "ai";
import { z } from "zod";

const ExtractedSchema = z.object({
  nome: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  experiencias: z.string().nullable().optional(),
});

type Extracted = z.infer<typeof ExtractedSchema>;

function cleanFileName(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[_\-]+/g, " ").trim() || "Candidato";
}

function hasEnoughText(text: string) {
  const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  return letters >= 80;
}

export const parseAndCreateCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; pdfBase64: string; cvText: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const cvText = (data.cvText || "").slice(0, 12000);
    let extracted: Extracted = {};
    let aiFailed = false;
    let aiErrorMsg: string | null = null;

    if (hasEnoughText(cvText)) {
      try {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");
        const { object } = await generateObject({
          model,
          schema: ExtractedSchema,
          prompt:
            "Extraia os dados do candidato a partir do texto do currículo abaixo. " +
            "Campos: nome completo, telefone (apenas dígitos com DDD), email, cidade (sem estado), " +
            "e um resumo curto das experiências profissionais (máx 500 caracteres). " +
            "Se algum campo não estiver presente, retorne null.\n\nCURRÍCULO:\n" + cvText,
        });
        extracted = object;
      } catch (e) {
        aiFailed = true;
        aiErrorMsg = e instanceof Error ? e.message : "Erro IA";
      }
    } else {
      aiFailed = true;
      aiErrorMsg = "PDF sem texto legível (possivelmente escaneado)";
    }

    // Upload PDF
    const safeName = data.fileName.replace(/[^\w.\-]/g, "_");
    const path = `${userId}/${Date.now()}-${safeName}`;
    const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabase.storage
      .from("curriculos")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

    const nomeFinal = (extracted.nome && extracted.nome.trim()) || cleanFileName(data.fileName);
    const observacoes = aiFailed
      ? `Extração automática falhou (${aiErrorMsg}). Edite manualmente.`
      : null;

    const { data: inserted, error } = await supabase
      .from("candidatos")
      .insert({
        nome: nomeFinal,
        telefone: extracted.telefone || "",
        email: extracted.email || null,
        cidade: extracted.cidade || "",
        experiencias: extracted.experiencias || null,
        observacoes,
        curriculo_url: path,
        recrutador_id: userId,
        status: "triagem",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { candidato: inserted, aiFailed };
  });
