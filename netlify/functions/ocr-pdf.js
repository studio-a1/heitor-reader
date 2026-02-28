import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js";

export default async function handler(req, res) {
  try {
    const buffer = await getPdfBuffer(req); // <-- MANTÉM seu método atual

    const pdf = await pdfjs.getDocument({ data: buffer }).promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      fullText += content.items.map(i => i.str).join(" ") + "\n\n";
    }

    res.status(200).json({ text: fullText });
  } catch (err) {
    console.error("PDF BACKEND ERROR:", err);
    res.status(500).json({ error: "Erro ao processar PDF" });
  }
}

