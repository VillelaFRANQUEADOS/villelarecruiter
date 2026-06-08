// Client-side extraction for PDF / DOCX / images. Returns text plus optional
// rendered page images (data URIs) for OCR by the AI vision model.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import mammoth from "mammoth/mammoth.browser";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl as string;

export type ExtractKind = "pdf" | "docx" | "image";
export interface Extracted {
  kind: ExtractKind;
  text: string;
  images: string[];
  mimeType: string;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

function hasEnoughText(text: string, pages = 1) {
  const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  return letters >= Math.max(250, pages * 200);
}

const MAX_OCR_PAGES_FAST = 6;
const MAX_OCR_PAGES_DEEP = 12;

export async function extractFromFile(file: File): Promise<Extracted> {
  return extractInternal(file, false);
}

// Deep mode: força OCR de TODAS as páginas (até cap) mesmo quando há texto.
// Usado pelo botão "Reprocessar" para máxima precisão.
export async function extractFromFileDeep(file: File): Promise<Extracted> {
  return extractInternal(file, true);
}

async function extractInternal(file: File, deep: boolean): Promise<Extracted> {
  const lname = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || lname.endsWith(".pdf")) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }

    const images: string[] = [];
    const needsOcr = deep || !hasEnoughText(text, pdf.numPages);
    if (needsOcr) {
      const cap = deep ? MAX_OCR_PAGES_DEEP : MAX_OCR_PAGES_FAST;
      const pageCount = Math.min(pdf.numPages, cap);
      for (let i = 1; i <= pageCount; i++) {
        images.push(await renderPdfPageToDataUri(pdf, i, deep ? 2.2 : 2.0));
      }
    }

    return { kind: "pdf", text, images, mimeType: "application/pdf" };
  }

  if (
    lname.endsWith(".docx") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    let text = res.value || "";
    // Fallback: alguns DOCX guardam tudo em tabelas/elementos não capturados
    // pelo extractRawText. Tenta HTML e descarta tags.
    if (text.replace(/\s/g, "").length < 100) {
      try {
        const html = await mammoth.convertToHtml({ arrayBuffer: buf });
        const stripped = (html.value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (stripped.length > text.length) text = stripped;
      } catch { /* mantém o que tem */ }
    }
    return {
      kind: "docx",
      text,
      images: [],
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  if (lname.endsWith(".doc")) {
    throw new Error("Formato .doc legado não suportado. Salve como .docx ou PDF.");
  }

  if (IMAGE_TYPES.includes(type) || /\.(jpe?g|png|webp)$/i.test(lname)) {
    const dataUri = await fileToDataUri(file);
    return { kind: "image", text: "", images: [dataUri], mimeType: type || guessImageMime(lname) };
  }

  throw new Error(`Tipo não suportado: ${file.name}`);
}

function guessImageMime(name: string) {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  return "image/jpeg";
}

async function renderPdfPageToDataUri(pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>, pageNum: number, scale = 2.0): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL("image/jpeg", 0.9);
}

export async function fileToDataUri(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}
