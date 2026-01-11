import OpenAI from "openai";

export async function handler(event) {
  try {
    console.log("OCR function invoked");

    // ===== 1. Validação básica =====
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not found");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "API key not configured" }),
      };
    }

    // ===== 2. Parse do body =====
    const body = JSON.parse(event.body || "{}");
    const imageBase64 = body.image;

    if (!imageBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Image not provided" }),
      };
    }

    // ===== 3. Cliente OpenAI =====
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // ===== 4. Chamada OCR (Vision) =====
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extraia TODO o texto legível desta imagem. Não explique nada.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64, // data:image/png;base64,...
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const extractedText =
      response.choices?.[0]?.message?.content || "";

    // ===== 5. Resposta =====
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        text: extractedText,
      }),
    };
  } catch (error) {
    console.error("OCR error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: "OCR processing failed",
      }),
    };
  }
}

