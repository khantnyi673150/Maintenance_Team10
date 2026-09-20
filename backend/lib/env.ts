import "server-only";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const supabaseEnv = () => ({
  url: requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  anonKey: requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
});
