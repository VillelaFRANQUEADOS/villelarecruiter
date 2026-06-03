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
  images: string[]; // data URIs (image/jpeg) for vision OCR
  mimeType: string;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

function hasEnoughText(text: string) {
  const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
  return letters >= 120;
}

export async function extractFromFile(file: File): Promise<Extracted> {
  const lname = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || lname.endsWith(".pdf")) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    const maxText = Math.min(pdf.numPages, 10);
    for (let i = 1; i <= maxText; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    let images: string[] = [];
    if (!hasEnoughText(text)) {
      // OCR fallback: render first pages to images
      const ocrMax = Math.min(pdf.numPages, 3);
      for (let i = 1; i <= ocrMax; i++) {
        images.push(await renderPdfPageToDataUri(pdf, i));
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
    return {
      kind: "docx",
      text: res.value || "",
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

async function renderPdfPageToDataUri(
  pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>,
  pageNum: number,
): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
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
