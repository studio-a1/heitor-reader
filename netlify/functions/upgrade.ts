import { createClient } from "@supabase/supabase-js";

export const handler = async (event) => {

  const token = event.headers.authorization?.replace("Bearer ", "");
  const { plan } = JSON.parse(event.body);

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No token" })
    };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Invalid user" })
    };
  }

  const { error } = await supabase
    .from("users")
    .update({ plan })
    .eq("id", user.id);

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
