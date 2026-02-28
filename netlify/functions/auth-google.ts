import { OAuth2Client } from "google-auth-library";
import { supabase } from "./lib/supabase";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const handler = async (event) => {
  try {
    const { token } = JSON.parse(event.body);

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
      return { statusCode: 400 };
    }

    // cria usuário se não existir
    const { data } = await supabase
      .from("users")
      .upsert({
        id: payload.sub,
        email: payload.email,
      })
      .select()
      .single();

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500 };
  }
};

