import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// 🔐 INIT
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const token = event.headers.authorization?.replace("Bearer ", "");
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: "no_token" }) };

    const { data: authData } = await supabase.auth.getUser(token);
    if (!authData?.user) return { statusCode: 401, body: JSON.stringify({ error: "invalid_token" }) };

    const { text, speed = 1 } = JSON.parse(event.body || "{}");

    if (!text) return { statusCode: 400, body: JSON.stringify({ error: "no_text" }) };

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",           // pode mudar depois para alloy, echo, etc.
      input: text,
      speed: Math.max(0.5, Math.min(2, speed)),
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": "attachment; filename=heitor.mp3",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("TTS ERROR:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "tts_failed" }) };
  }
};
