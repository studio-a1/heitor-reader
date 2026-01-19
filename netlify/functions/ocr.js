
import OpenAI from "openai";
import Busboy from "busboy";

export const handler = async (event) => {
  console.log("OCR function invoked");

  if (!process.env.OPENAI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API key not configured" })
    };
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  return new Promise((resolve) => {
    const busboy = Busboy({
      headers: event.headers
    });

    let imageBuffer = null;
    let mimeType = "image/jpeg";

    busboy.on("file", (_, file, info) => {
      const chunks = [];
      mimeType = info.mimeType || "image/jpeg";

      file.on("data", (data) => chunks.push(data));
      file.on("end", () => {
        imageBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("finish", async () => {
      if (!imageBuffer) {
        resolve({
          statusCode: 400,
          body: JSON.stringify({ error: "No image received" })
        });
        return;
      }

      try {
        const base64Image = imageBuffer.toString("base64");

        const response = await openai.responses.create({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Transcreva todo o texto da imagem em português."
                },
                {
                  type: "input_image",
                  image_url: `data:${mimeType};base64,${base64Image}`
                }
              ]
            }
          ]
        });

        const text =
          response.output_text ||
          response.output?.[0]?.content?.[0]?.text ||
          "";

        resolve({
          statusCode: 200,
          body: JSON.stringify({ text })
        });
      } catch (err) {
        console.error("OCR error:", err);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: "OCR failed" })
        });
      }
    });

    busboy.end(Buffer.from(event.body, "base64"));
  });
};

