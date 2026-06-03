import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

function authHeaders() {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY ausente (conecte o Google Drive)");
  return {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
  };
}

export async function uploadPdfToDrive(opts: {
  filename: string;
  pdfBase64: string;
  mimeType?: string;
}): Promise<{ fileId: string }> {
  const headers = authHeaders();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const mimeType = opts.mimeType || "application/pdf";

  const metadata: Record<string, unknown> = { name: opts.filename, mimeType };
  if (folderId) metadata.parents = [folderId];

  const boundary = `----lov${Date.now().toString(36)}`;
  const bytes = Uint8Array.from(atob(opts.pdfBase64), (c) => c.charCodeAt(0));
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(`${GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload falhou [${res.status}]: ${text}`);
  }
  const json = (await res.json()) as { id: string };
  return { fileId: json.id };
}


export const getCurriculoContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => z.object({ fileId: z.string().min(5).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const headers = authHeaders();
    const res = await fetch(`${GATEWAY}/drive/v3/files/${encodeURIComponent(data.fileId)}?alt=media`, {
      headers,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404) throw new Error("Currículo não encontrado no Google Drive (arquivo removido ou sem permissão).");
      if (res.status === 401 || res.status === 403) throw new Error("Conexão com o Google Drive expirou. Reconecte em Connectors.");
      throw new Error(`Falha ao baixar do Drive [${res.status}]: ${text.slice(0, 200)}`);
    }
    const mimeType = res.headers.get("content-type")?.split(";")[0] || "application/pdf";
    const arr = await res.arrayBuffer();
    // Buffer base64 é muito mais rápido que loop char-a-char + btoa
    const base64 = Buffer.from(arr).toString("base64");
    return { base64, mimeType };
  });

export const deleteCurriculoFromDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => z.object({ fileId: z.string().min(5).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const headers = authHeaders();
    const res = await fetch(`${GATEWAY}/drive/v3/files/${encodeURIComponent(data.fileId)}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`Drive delete falhou [${res.status}]: ${text}`);
    }
    return { ok: true };
  });
