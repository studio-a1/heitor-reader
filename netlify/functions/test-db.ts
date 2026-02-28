import { supabase } from "./lib/supabase";

export const handler = async () => {
  const { data, error } = await supabase
    .from("users")
    .select("*");

  return {
    statusCode: 200,
    body: JSON.stringify({ data, error }),
  };
};
