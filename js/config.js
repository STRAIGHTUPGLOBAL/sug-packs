// The Supabase project. Both values are public by design (they sit in every
// visitor's browser); the database's access rules keep the data private.
// Supabase → Project Settings → API (or "Connect").
export const SUPABASE_URL = "https://cadmgskxpwzjgalplnse.supabase.co";
export const SUPABASE_KEY = "sb_publishable_ugcwStIcQljgtt8xU72tvA_Vs4CsKKw"; // the "publishable" key, never the secret one

// Without a project, or with ?demo in the address, the app runs on demo data.
export const DEMO = !SUPABASE_URL || new URLSearchParams(location.search).has("demo");
