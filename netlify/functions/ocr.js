import OpenAI from "openai";
import Busboy from "busboy";
import { createClient } from "@supabase/supabase-js";

// 🔐 INIT
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const limits = {
  free: { monthly: 60, daily: 2 },
  freemium: { monthly: 300, daily: 20 },
  premium: { monthly: 1500, daily: null },
};

// ================= HANDLER =================
export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const token = event.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: "no_token" }) };
    }

    // ================= AUTH =================
    const { data: authData } = await supabase.auth.getUser(token);
    if (!authData?.user) {
      return { statusCode: 401, body: JSON.stringify({ error: "invalid_token" }) };
    }

    const userId = authData.user.id;

    // ================= USER =================
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (!user) {
      return { statusCode: 500, body: JSON.stringify({ error: "user_not_found" }) };
    }

    // ================= PLAN =================
    let plan = (user.plan || "free").toLowerCase().trim();
    if (!limits[plan]) plan = "free";

    // ================= MOCK FREEMIUM (BETA) =================
    // 🔥 Isso resolve o loop que você estava tendo!
    // Agora, mesmo que o banco ainda esteja como "free", o backend
    // força o plano para "freemium" durante a fase de teste.
    // Quando você liberar o Premium de verdade, é só apagar esse bloco.
    if (plan === "free") {
      plan = "freemium";
      console.log("🔧 [BETA MOCK] Plano FREE forçado para FREEMIUM - modo teste ativo");
    }

    let {
      usage = 0,
      daily_usage = 0,
      last_reset,
      monthly_reset,
    } = user;

    const now = new Date();
    let updated = false;

    // 🔄 RESET DIÁRIO (REAL)
    const lastDaily = last_reset ? new Date(last_reset) : null;
    const isDifferentDay =
      !lastDaily ||
      now.getDate() !== lastDaily.getDate() ||
      now.getMonth() !== lastDaily.getMonth() ||
      now.getFullYear() !== lastDaily.getFullYear();

    if (isDifferentDay) {
      daily_usage = 0;
      last_reset = now.toISOString();
      updated = true;
    }

    // 🔄 RESET MENSAL
    const lastMonthly = monthly_reset ? new Date(monthly_reset) : null;
    const isDifferentMonth =
      !lastMonthly ||
      now.getMonth() !== lastMonthly.getMonth() ||
      now.getFullYear() !== lastMonthly.getFullYear();

    if (isDifferentMonth) {
      usage = 0;
      monthly_reset = now.toISOString();
      updated = true;
    }

    if (updated) {
      await supabase
        .from("users")
        .update({
          usage,
          daily_usage,
          last_reset,
          monthly_reset,
        })
        .eq("id", userId);
    }

    const planLimits = limits[plan];

    // ================= LIMITES =================
    if (planLimits.monthly !== null && usage >= planLimits.monthly) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "monthly_limit" }),
      };
    }

    if (
      plan !== "premium" &&
      planLimits.daily !== null &&
      daily_usage >= planLimits.daily
    ) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "daily_limit" }),
      };
    }

    // ================= PARSE FILE =================
    return await new Promise((resolve) => {
      const busboy = Busboy({ headers: event.headers });
      let imageBuffer = null;
      let mimeType = "image/png";

      busboy.on("file", (_, file, info) => {
        const chunks = [];
        mimeType = info.mimeType || "image/png";
        file.on("data", (d) => chunks.push(d));
        file.on("end", () => {
          imageBuffer = Buffer.concat(chunks);
        });
      });

      busboy.on("finish", async () => {
        if (!imageBuffer) {
          resolve({
            statusCode: 400,
            body: JSON.stringify({ error: "no_image" }),
          });
          return;
        }

        try {
          const base64Image = imageBuffer.toString("base64");

          // ================= OCR =================
          const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            input: [
              {
                role: "user",
                content: [
                  { type: "input_text", text: "Extraia TODO o texto da imagem." },
                  {
                    type: "input_image",
                    image_url: `data:${mimeType};base64,${base64Image}`,
                  },
                ],
              },
            ],
          });

          // ================= EXTRAÇÃO ROBUSTA =================
          let text = "";
          if (response.output_text) {
            text = response.output_text;
          } else if (response.output?.length) {
            const content = response.output[0]?.content;
            if (content?.length) {
              text = content.map(c => c.text || "").join(" ");
            }
          }

          text = text || "";

          // ================= INCREMENTO =================
          usage += 1;
          daily_usage += 1;

          await supabase
            .from("users")
            .update({
              usage,
              daily_usage,
              last_reset,
              monthly_reset,
            })
            .eq("id", userId);

          // ================= RESPONSE =================
          resolve({
            statusCode: 200,
            body: JSON.stringify({
              text,
              plan,
              usage: {
                daily: daily_usage,
                monthly: usage,
              },
              limits: planLimits,
            }),
          });
        } catch (err) {
          console.error("OCR ERROR:", err);
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: "ocr_failed" }),
          });
        }
      });

      busboy.end(Buffer.from(event.body, "base64"));
    });
  } catch (err) {
    console.error("FATAL OCR ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "server_error" }),
    };
  }
};
