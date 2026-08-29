import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed." });

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return reply(401, { error: "Missing authorization." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return reply(500, { error: "Server configuration is incomplete." });

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return reply(401, { error: "Invalid admin session." });

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role,active")
      .eq("id", userData.user.id)
      .single();
    if (profileError || callerProfile?.role !== "admin" || !callerProfile.active) {
      return reply(403, { error: "Active administrator access required." });
    }

    const body = await req.json();
    const action = String(body?.action || "");
    const userId = String(body?.user_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return reply(400, { error: "Invalid customer ID." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id,display_name,login_id,role")
      .eq("id", userId)
      .single();
    if (targetError || !target) return reply(404, { error: "Customer not found." });
    if (target.role !== "wholesaler") return reply(403, { error: "Only customer accounts can be managed." });

    if (action === "reset-password") {
      const password = String(body?.password || "");
      if (password.length < 8 || password.length > 72) {
        return reply(400, { error: "Password must be 8 to 72 characters." });
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true, action, customer: target.display_name });
    }

    if (action === "delete-customer") {
      const { error: disableError } = await admin.from("profiles").update({ active: false }).eq("id", userId);
      if (disableError) return reply(400, { error: disableError.message });
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true, action, customer: target.display_name });
    }

    return reply(400, { error: "Unsupported action." });
  } catch (error) {
    return reply(500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
});
