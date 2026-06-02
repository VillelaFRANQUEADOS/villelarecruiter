// Client-side text extraction for PDF, DOCX, TXT and images (OCR)
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl as string;

export const ACCEPTED_TYPES =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,image/*";

export const ACCEPTED_EXTS = [".pdf", ".docx", ".doc", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"];

export function isAcceptedFile(f: File): boolean {
  const n = f.name.toLowerCase();
  if (ACCEPTED_EXTS.some((e) => n.endsWith(e))) return true;
  if (f.type.startsWith("image/")) return true;
  if (f.type === "application/pdf") return true;
  if (f.type === "text/plain") return true;
  return false;
}

async function extractPdf(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  const max = Math.min(pdf.numPages, 20);
  for (let i = 1; i <= max; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  return text;
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value || "";
}

async function extractTxt(file: File): Promise<string> {
  return await file.text();
}

async function extractImageOcr(file: File): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const { data } = await Tesseract.recognize(file, "por+eng");
  return data.text || "";
}

export async function extractAnyText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return extractPdf(file);
  if (name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(file);
  if (name.endsWith(".txt") || file.type === "text/plain") return extractTxt(file);
  if (file.type.startsWith("image/")) return extractImageOcr(file);
  if (name.endsWith(".doc")) {
    // Old .doc não tem parser robusto no browser; tenta como texto bruto
    return extractTxt(file);
  }
  throw new Error("Formato não suportado");
}

// Mantido p/ compat
export const extractPdfText = extractPdf;

export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function detectMime(file: File): string {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".doc")) return "application/msword";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
