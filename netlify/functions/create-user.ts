import { supabase } from "./lib/supabase";

export const handler = async (event: any) => {
  try {
    console.log("BODY RECEBIDO:", event.body);

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Body is missing" }),
      };
    }
const test = await supabase.from("users").select("*").limit(1);
console.log("TEST SELECT:", test);
    const { id, email } = JSON.parse(event.body);

    console.log("ID:", id);
    console.log("EMAIL:", email);

    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: fetchError.message }),
      };
    }

    // Se não existir, cria
    if (!existingUser) {
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          id,
          email,
          plan: "free",
          daily_usage: 0,   // ✅ nome correto
          usage: 0,         // ✅ nome correto
        })
        .select()
        .single();

      if (insertError) {
        console.log("SUPABASE ERROR:", insertError);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: insertError.message }),
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ user: newUser }),
      };
    }
console.log("SERVICE KEY INICIO:", process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20));
    return {
      statusCode: 200,
      body: JSON.stringify({ user: existingUser }),
    };
  } catch (err: any) {
    console.log("CATCH ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
    
  }
};
