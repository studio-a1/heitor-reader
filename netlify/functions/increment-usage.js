import { createClient } from "@supabase/supabase-js";

export async function handler(event) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const token = event.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    // Pega usuário pelo token
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Invalid user" }),
      };
    }

    const userId = user.id;

    // Busca dados atuais
    const { data: profile, error: fetchError } = await supabase
      .from("users")
      .select("usage, daily_usage, monthly_reset, last_reset, plan")
      .eq("id", userId)
      .single();

    if (fetchError || !profile) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    let monthlyUsage = profile.usage || 0;
    let dailyUsage = profile.daily_usage || 0;

    const now = new Date();

    const monthlyReset = profile.monthly_reset
      ? new Date(profile.monthly_reset)
      : now;

    const dailyReset = profile.last_reset
      ? new Date(profile.last_reset)
      : now;

    // Reset mensal (30 dias)
    if (now - monthlyReset > 30 * 24 * 60 * 60 * 1000) {
      monthlyUsage = 0;
    }

    // Reset diário (24h)
    if (now - dailyReset > 24 * 60 * 60 * 1000) {
      dailyUsage = 0;
    }

    monthlyUsage += 1;
    dailyUsage += 1;

    const { error: updateError } = await supabase
      .from("users")
      .update({
        usage: monthlyUsage,
        daily_usage: dailyUsage,
        monthly_reset: now,
        last_reset: now,
      })
      .eq("id", userId);

    if (updateError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Update failed" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        monthly: monthlyUsage,
        daily: dailyUsage,
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
}
