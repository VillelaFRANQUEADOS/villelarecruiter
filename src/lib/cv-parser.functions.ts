import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { generateText, Output } from "ai";
import { z } from "zod";

const ExtractedSchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  cidade: z.string().nullable().optional(),
  experiencias: z.string().nullable().optional(),
});

export const parseAndCreateCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; pdfBase64: string; cvText: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const cvText = (data.cvText || "").slice(0, 12000);

    const { experimental_output: output } = await generateText({
      model,
      experimental_output: Output.object({ schema: ExtractedSchema }),
      prompt:
        "Extraia os dados do candidato a partir do texto do currículo abaixo. " +
        "Retorne nome completo, telefone (somente dígitos com DDD se possível), email, " +
        "cidade (apenas a cidade, sem estado) e um resumo curto das experiências profissionais " +
        "(máximo 500 caracteres, em uma única string).\n\n" +
        "CURRÍCULO:\n" + cvText,
    });

    // Upload PDF to storage
    const safeName = data.fileName.replace(/[^\w.\-]/g, "_");
    const path = `${userId}/${Date.now()}-${safeName}`;
    const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
    const { error: upErr } = await supabase.storage
      .from("curriculos")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);

    const { data: inserted, error } = await supabase
      .from("candidatos")
      .insert({
        nome: output.nome,
        telefone: output.telefone || "",
        email: output.email || null,
        cidade: output.cidade || "",
        experiencias: output.experiencias || null,
        curriculo_url: path,
        recrutador_id: userId,
        status: "triagem",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { candidato: inserted };
  });
