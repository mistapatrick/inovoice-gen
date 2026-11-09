import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import regularFontUrl from "./assets/DejaVuSans.ttf?url";
import boldFontUrl from "./assets/DejaVuSans-Bold.ttf?url";
import italicFontUrl from "./assets/DejaVuSans-Oblique.ttf?url";
import type { Profile, Client, Item, DocType, ThemeId } from "./types";

type PdfInput = {
  type: DocType; number: string; date: string; profile: Profile; recipient: Client;
  items: Item[]; currency: string; theme: ThemeId; discount: number; taxRate: number;
  additionalCharges: number; paymentDate: string; paymentMethod: string;
  paymentReference: string; amountReceived: number; notes: string; total: number;
};

const palettes: Record<ThemeId, { primary: [number, number, number]; accent: [number, number, number]; ink: [number, number, number]; pale: [number, number, number] }> = {
  corporate: { primary: [0.10, 0.20, 0.38], accent: [0.24, 0.43, 0.68], ink: [0.12, 0.15, 0.20], pale: [0.93, 0.95, 0.98] },
  minimal: { primary: [0.06, 0.46, 0.43], accent: [0.12, 0.62, 0.56], ink: [0.13, 0.18, 0.18], pale: [0.91, 0.97, 0.96] },
  executive: { primary: [0.15, 0.16, 0.18], accent: [0.70, 0.54, 0.28], ink: [0.13, 0.13, 0.14], pale: [0.96, 0.95, 0.92] },
  creative: { primary: [0.31, 0.25, 0.60], accent: [0.91, 0.39, 0.22], ink: [0.16, 0.15, 0.20], pale: [0.96, 0.94, 0.98] }
};

const money = (amount: number, currency: string) => {
  try { return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
};
const color = (v: [number, number, number]) => rgb(v[0], v[1], v[2]);
const safe = (value: string | undefined) => value?.trim() || "";

async function imageBytes(dataUrl: string): Promise<Uint8Array> {
  const response = await fetch(dataUrl);
  return new Uint8Array(await response.arrayBuffer());
}

export async function createPdf(input: PdfInput, includeBranding: boolean): Promise<Uint8Array> {
  const isReceipt = input.type === "receipt";
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${input.type.toUpperCase()} ${input.number}`);
  pdf.setAuthor(safe(input.profile.name) || "Invoice Gen user");
  pdf.setSubject("Generated with Invoice Gen");
  const pageSize: [number, number] = isReceipt ? [419.53, 595.28] : [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  const { width, height } = page.getSize();
  const p = palettes[input.theme];
  const primary = color(p.primary), accent = color(p.accent), ink = color(p.ink), pale = color(p.pale);
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes, italicBytes] = await Promise.all([
    fetch(regularFontUrl).then(r => r.arrayBuffer()),
    fetch(boldFontUrl).then(r => r.arrayBuffer()),
    fetch(italicFontUrl).then(r => r.arrayBuffer())
  ]);
  const regular = await pdf.embedFont(regularBytes);
  const bold = await pdf.embedFont(boldBytes);
  const italic = await pdf.embedFont(italicBytes);
  const margin = isReceipt ? 28 : 42;
  let y = height - margin;

  const drawText = (text: string, x: number, top: number, size = 9, font = regular, c = ink) => {
    page.drawText(text || "", { x, y: top - size, size, font, color: c, maxWidth: width - x - margin });
  };
  const line = (x1: number, x2: number, top: number, c = pale, thickness = 1) => {
    page.drawLine({ start: { x: x1, y: top }, end: { x: x2, y: top }, color: c, thickness });
  };
  const wrap = (text: string, maxChars: number) => {
    const words = (text || "").split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) { lines.push(current); current = word; }
      else current = candidate;
    }
    if (current) lines.push(current);
    return lines;
  };
  const typeLabel = input.type === "proforma" ? "PRO FORMA INVOICE" : input.type === "invoice" ? "INVOICE" : "PAYMENT RECEIPT";

  page.drawRectangle({ x: 0, y: height - (isReceipt ? 94 : 130), width, height: isReceipt ? 94 : 130, color: primary });
  drawText(typeLabel, margin, height - 34, isReceipt ? 15 : 21, bold, rgb(1, 1, 1));
  drawText(input.number, margin, height - (isReceipt ? 58 : 68), 9, regular, rgb(1, 1, 1));
  drawText(`DATE: ${input.date}`, margin, height - (isReceipt ? 75 : 88), 8, regular, rgb(1, 1, 1));

  if (input.profile.logo) {
    try {
      const bytes = await imageBytes(input.profile.logo);
      const img = input.profile.logo.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const dims = img.scale(Math.min(0.8, 58 / Math.max(img.width, img.height)));
      page.drawImage(img, { x: width - margin - dims.width, y: height - (isReceipt ? 78 : 108), width: dims.width, height: dims.height });
    } catch { /* invalid optional image is skipped */ }
  }

  y = height - (isReceipt ? 112 : 151);
  const senderName = safe(input.profile.tradingName) || safe(input.profile.name) || "Your business name";
  drawText(senderName, margin, y, isReceipt ? 11 : 13, bold, primary); y -= 17;
  [input.profile.address, input.profile.phone, input.profile.email, input.profile.website].filter(Boolean).forEach(v => { drawText(v, margin, y, 8); y -= 12; });
  y -= 7;
  line(margin, width - margin, y, accent, 1.2); y -= 17;

  drawText(isReceipt ? "RECEIVED FROM" : "BILL TO", margin, y, 8, bold, accent); y -= 15;
  drawText(input.recipient.name || "Customer", margin, y, 10, bold); y -= 13;
  [input.recipient.contact, input.recipient.address, input.recipient.email, input.recipient.phone].filter(Boolean).forEach(v => { drawText(v, margin, y, 8); y -= 11; });
  y -= 14;

  if (isReceipt) {
    const rows = [
      ["Amount received", money(input.amountReceived || input.total, input.currency)],
      ["Payment date", input.paymentDate || input.date],
      ["Payment method", input.paymentMethod || "Not specified"],
      ["Reference", input.paymentReference || "Not provided"]
    ];
    rows.forEach(([label, value]) => {
      page.drawRectangle({ x: margin, y: y - 23, width: width - margin * 2, height: 27, color: pale });
      drawText(label, margin + 9, y - 5, 8, regular);
      const valueWidth = bold.widthOfTextAtSize(value, 9);
      page.drawText(value, { x: width - margin - 9 - valueWidth, y: y - 14, size: 9, font: bold, color: ink });
      y -= 34;
    });
    if (input.notes) { y -= 5; drawText("DESCRIPTION", margin, y, 8, bold, accent); y -= 15; wrap(input.notes, 58).forEach(t => { drawText(t, margin, y, 8); y -= 11; }); }
  } else {
    const tableTop = y;
    page.drawRectangle({ x: margin, y: tableTop - 22, width: width - margin * 2, height: 24, color: primary });
    drawText("DESCRIPTION", margin + 7, tableTop - 7, 8, bold, rgb(1, 1, 1));
    drawText("QTY", width - margin - 185, tableTop - 7, 8, bold, rgb(1, 1, 1));
    drawText("UNIT PRICE", width - margin - 132, tableTop - 7, 8, bold, rgb(1, 1, 1));
    drawText("AMOUNT", width - margin - 68, tableTop - 7, 8, bold, rgb(1, 1, 1));
    y -= 34;
    for (const item of input.items) {
      if (y < 145) {
        page = pdf.addPage(pageSize);
        y = height - 55;
      }
      const descLines = wrap(item.description || "Item", 38);
      descLines.forEach((txt, idx) => { drawText(txt, margin + 7, y - idx * 11, 8); });
      drawText(`${item.quantity} ${item.unit || ""}`, width - margin - 185, y, 8);
      drawText(money(item.unitPrice, input.currency), width - margin - 132, y, 7);
      const amount = money(item.quantity * item.unitPrice, input.currency);
      const aw = regular.widthOfTextAtSize(amount, 7);
      page.drawText(amount, { x: width - margin - 7 - aw, y: y - 7, size: 7, font: regular, color: ink });
      y -= Math.max(25, descLines.length * 11 + 10);
      line(margin, width - margin, y + 4, pale, 0.6);
    }
    y -= 10;
    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discount = Math.min(Math.max(input.discount, 0), subtotal);
    const taxable = subtotal - discount;
    const tax = taxable * input.taxRate / 100;
    const totals = [
      ["Subtotal", money(subtotal, input.currency)],
      ...(discount ? [["Discount", `-${money(discount, input.currency)}`]] : []),
      ...(input.taxRate ? [[`Tax (${input.taxRate}%)`, money(tax, input.currency)]] : []),
      ...(input.additionalCharges ? [["Additional charges", money(input.additionalCharges, input.currency)]] : [])
    ];
    totals.forEach(([label, value]) => {
      drawText(label, width - margin - 185, y, 8);
      const w = regular.widthOfTextAtSize(value, 8);
      page.drawText(value, { x: width - margin - w, y: y - 8, size: 8, font: regular, color: ink });
      y -= 15;
    });
    page.drawRectangle({ x: width - margin - 205, y: y - 24, width: 205, height: 30, color: pale });
    drawText("TOTAL", width - margin - 195, y - 3, 9, bold, primary);
    const totalText = money(input.total, input.currency);
    const tw = bold.widthOfTextAtSize(totalText, 10);
    page.drawText(totalText, { x: width - margin - 10 - tw, y: y - 10, size: 10, font: bold, color: primary });
    y -= 48;

    if (input.type === "proforma") {
      const expiry = new Date(`${input.date}T00:00:00`);
      expiry.setDate(expiry.getDate() + 30);
      const expiryText = expiry.toLocaleDateString("en-GB");
      drawText(`PRICE VALIDITY: Prices are valid for 30 calendar days from the date of issue (until ${expiryText}).`, margin, y, 8, bold, accent);
      y -= 22;
    } else {
      drawText("PAYMENT DETAILS", margin, y, 8, bold, accent); y -= 14;
      [input.profile.bankName, input.profile.accountName, input.profile.accountNumber].filter(Boolean).forEach(v => { drawText(v, margin, y, 8); y -= 11; });
      y -= 6;
    }
    if (input.notes) {
      drawText("NOTES", margin, y, 8, bold, accent); y -= 13;
      wrap(input.notes, 90).forEach(t => { drawText(t, margin, y, 8); y -= 11; });
    }
  }

  if (input.profile.signature) {
    try {
      const bytes = await imageBytes(input.profile.signature);
      const img = input.profile.signature.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const dims = img.scale(Math.min(0.7, 110 / img.width, 42 / img.height));
      page.drawImage(img, { x: margin, y: Math.max(35, y - 48), width: dims.width, height: dims.height });
      drawText("Authorised signature", margin, Math.max(30, y - 55), 7, italic);
    } catch {
      drawText(input.profile.name, margin, Math.max(35, y - 30), 16, italic, primary);
      drawText("Authorised signature", margin, Math.max(24, y - 42), 7);
    }
  } else {
    drawText(input.profile.name || "Authorised signatory", margin, Math.max(35, y - 30), 16, italic, primary);
    drawText("Authorised signature", margin, Math.max(24, y - 42), 7);
  }

  if (includeBranding) {
    page.drawText("Generated with Invoice Gen", {
      x: margin, y: 14, size: 7, font: regular, color: accent
    });
  }

  return await pdf.save();
}

export function dataUrlFromBytes(bytes: Uint8Array, mime = "application/pdf"): string {
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return `data:${mime};base64,${btoa(binary)}`;
}

export function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
