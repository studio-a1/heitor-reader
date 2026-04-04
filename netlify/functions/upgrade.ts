import { createClient } from "@supabase/supabase-js";

export const handler = async (event) => {
  try {
    // ================= TOKEN =================
    const token = event.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "No token" })
      };
    }

    // ================= BODY =================
    let plan = "freemium"; // 🔥 padrão beta

    try {
      const body = JSON.parse(event.body || "{}");

      if (body?.plan) {
        plan = body.plan.toString().toLowerCase().trim();
      }
    } catch {
      // ignora erro de JSON
    }

    // 🔒 BLOQUEIA QUALQUER COISA DIFERENTE DE FREEMIUM
    if (plan !== "freemium") {
      plan = "freemium";
    }

    // ================= SUPABASE =================
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid user" })
      };
    }

    // ================= UPDATE =================
    const { error: updateError } = await supabase
      .from("users")
      .update({
        plan,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("UPGRADE ERROR:", updateError);

      return {
        statusCode: 500,
        body: JSON.stringify({ error: updateError.message })
      };
    }

    console.log("PLAN UPDATED:", user.id, "→", plan);

    // ================= RESPONSE =================
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        plan,
      })
    };

  } catch (err) {
    console.error("FATAL UPGRADE ERROR:", err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "server_error",
        message: err.message
      })
    };
  }
};
