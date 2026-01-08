import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // Service Role Key

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Error: SUPABASE_URL o SUPABASE_KEY no definidos en el .env");
}

// Cliente único para todo el Backend (DB + Storage)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});