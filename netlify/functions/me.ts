import { createClient } from "@supabase/supabase-js";

export default async (request: Request) => {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No token provided" }),
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🔐 Valida token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401 }
      );
    }

    // 🔎 Busca usuário na tabela
    const { data: userData, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500 }
      );
    }

    // 🆕 Se não existir, cria como FREE
    if (!userData) {
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          id: user.id,
          email: user.email,
          plan: "free",               // ✅ CORREÇÃO AQUI
          usage: 0,                   // mensal
          daily_usage: 0,             // diário
          last_reset: new Date(),
          monthly_reset: new Date(),
        })
        .select()
        .single();

      if (insertError) {
        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 500 }
        );
      }

      return new Response(
        JSON.stringify({
          plan: newUser.plan,
          usage: {
            daily: newUser.daily_usage ?? 0,
            monthly: newUser.usage ?? 0,
          },
        }),
        { status: 200 }
      );
    }

    // ✅ Retorno padronizado para frontend
    return new Response(
      JSON.stringify({
        plan: userData.plan,
        usage: {
          daily: userData.daily_usage ?? 0,
          monthly: userData.usage ?? 0,
        },
      }),
      { status: 200 }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
};
