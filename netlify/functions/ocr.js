const OpenAI = require("openai");
const Busboy = require("busboy");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const limits = {
  free: { monthly: 60, daily: 2 },
  freemium: { monthly: 300, daily: 20 },
  premium: { monthly: null, daily: null },
};

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

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

  let {
    usage = 0,
    daily_usage = 0,
    last_reset,
    monthly_reset,
  } = user;

  const now = new Date();
  let updated = false;

  // ================= RESET DIÁRIO (REAL) =================
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

  // ================= RESET MENSAL =================
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
  if (
  planLimits.monthly !== null &&
  usage + 1 > planLimits.monthly
) {
  return {
    statusCode: 403,
    body: JSON.stringify({ error: "monthly_limit" }),
  };
}

 if (
  plan !== "premium" &&
  planLimits.daily !== null &&
  daily_usage + 1 > planLimits.daily
) {
  return {
    statusCode: 403,
    body: JSON.stringify({ error: "daily_limit" }),
  };
}

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

  // ================= OCR =================
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return new Promise((resolve) => {
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

        const response = await openai.responses.create({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "Transcreva fielmente todo o texto da imagem.",
                },
                {
                  type: "input_image",
                  image_url: `data:${mimeType};base64,${base64Image}`,
                },
              ],
            },
          ],
        });

        const text =
          response.output_text ||
          response.output?.[0]?.content?.[0]?.text ||
          "";

        resolve({
          statusCode: 200,
          body: JSON.stringify({
            text,
            plan,
            usage: {
              daily: daily_usage,
              monthly: usage,
              lastScan: last_reset,
            },
            limits: planLimits,
          }),
        });
      } catch (err) {
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: "ocr_failed" }),
        });
      }
    });

    busboy.end(Buffer.from(event.body, "base64"));
  });
};
