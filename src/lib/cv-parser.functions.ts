import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { uploadPdfToDrive } from "@/lib/curriculos.functions";
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

function extractPhoneFromText(text: string): string | null {
  if (!text) return null;
  const re = /(?:\+?55[\s.\-]?)?\(?(\d{2})\)?[\s.\-]?(9?\d{4})[\s.\-]?(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = (m[1] + m[2] + m[3]).replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) return digits;
  }
  return null;
}

function extractEmailFromText(text: string): string | null {
  if (!text) return null;
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : null;
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
            "Você extrai dados estruturados de currículos brasileiros. Retorne JSON com:\n" +
            "- nome: nome completo do candidato\n" +
            "- telefone: APENAS DÍGITOS, com DDD (10 ou 11 dígitos). Procure por padrões como " +
            "'(35) 99117-1223', '+55 35 9 9117 1223', '35 99117 1223', '35.99117.1223'. " +
            "Remova parênteses, traços, espaços, pontos e o DDI 55. Exemplo: '(35) 99117-1223' vira '35991171223'.\n" +
            "- email: endereço de email\n" +
            "- cidade: apenas o nome da cidade, sem estado\n" +
            "- experiencias: resumo curto das experiências profissionais (máx 500 caracteres)\n" +
            "Se algum campo não estiver presente, retorne null para ele.\n\nCURRÍCULO:\n" + cvText,

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

    // Upload PDF para o Google Drive
    const safeName = data.fileName.replace(/[^\w.\-]/g, "_");
    const driveName = `${Date.now()}-${safeName}`;
    let driveFileId: string;
    try {
      const up = await uploadPdfToDrive({ filename: driveName, pdfBase64: data.pdfBase64 });
      driveFileId = up.fileId;
    } catch (e) {
      throw new Error(`Upload Drive falhou: ${e instanceof Error ? e.message : String(e)}`);
    }

    const nomeFinal = (extracted.nome && extracted.nome.trim()) || cleanFileName(data.fileName);
    const observacoes = aiFailed
      ? `Extração automática falhou (${aiErrorMsg}). Edite manualmente.`
      : null;

    // Fallbacks via regex sobre o texto bruto (telefone e email)
    let telefoneFinal = (extracted.telefone || "").replace(/\D/g, "");
    if (telefoneFinal.startsWith("55") && telefoneFinal.length > 11) telefoneFinal = telefoneFinal.slice(2);
    if (telefoneFinal.length < 10 || telefoneFinal.length > 11) telefoneFinal = "";
    if (!telefoneFinal) telefoneFinal = extractPhoneFromText(cvText) || "";

    const emailFinal = (extracted.email && extracted.email.trim()) || extractEmailFromText(cvText) || null;

    const { data: inserted, error } = await supabase
      .from("candidatos")
      .insert({
        nome: nomeFinal,
        telefone: telefoneFinal,
        email: emailFinal,
        cidade: extracted.cidade || "",

        experiencias: extracted.experiencias || null,
        observacoes,
        curriculo_url: `drive:${driveFileId}`,
        recrutador_id: userId,
        status: "triagem",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { candidato: inserted, aiFailed };
  });
