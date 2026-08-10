import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const createLovableAiGatewayProvider = (lovableApiKey: string) =>
  createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

// IDs de modelo do Gateway de IA da Lovable (padrão "provedor/modelo").
// Usado como último recurso quando a chave pessoal do Google (GEMINI_API_KEY)
// estoura o limite de taxa do tier gratuito do Google AI Studio. O gateway da
// Lovable cobra dos créditos do workspace Lovable, uma cota totalmente
// separada da cota pessoal do Google AI Studio.
export const LOVABLE_GATEWAY_MODELS = {
  geminiFlash: "google/gemini-2.5-flash",
  geminiFlashLite: "google/gemini-2.5-flash-lite",
} as const;
