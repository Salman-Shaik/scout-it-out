import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const multiplayerConfigured = Boolean(url && key);

export const supabase = multiplayerConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

let signInPromise;

export const ensureAnonymousUser = () => {
  if (!signInPromise) {
    signInPromise = (async () => {
      const { data: existing } = await supabase.auth.getUser();
      if (existing.user) return existing.user;
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      return data.user;
    })().finally(() => { signInPromise = null; });
  }
  return signInPromise;
};

export const shuffleCodes = (countries) => {
  const codes = countries.map((country) => country.country_code);
  for (let index = codes.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [codes[index], codes[randomIndex]] = [codes[randomIndex], codes[index]];
  }
  return codes;
};

export const rpc = async (name, parameters = {}) => {
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
};
