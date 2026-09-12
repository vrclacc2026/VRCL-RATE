import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const VALID_CITIES = ['Rajkot', 'Ahmedabad', 'Udaan']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: { user }, error: userError } = await caller.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile, error: profileError } = await caller
      .from('profiles')
      .select('role,active')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin' || !profile.active) {
      return json({ error: 'Admin access required' }, 403)
    }

    const body = await req.json()
    const loginId = String(body.login_id || '').trim().toLowerCase()
    const displayName = String(body.display_name || '').trim()
    const password = String(body.password || '')
    const requestedCities = Array.isArray(body.cities) ? body.cities : [body.city]
    const cities = [...new Set(requestedCities.map(city => String(city || '').trim()))]

    if (!/^[a-z0-9._-]{3,40}$/.test(loginId)) {
      return json({ error: 'User ID must be 3-40 characters: letters, numbers, dot, dash or underscore.' }, 400)
    }
    if (!displayName || displayName.length > 120) return json({ error: 'Customer name required.' }, 400)
    if (password.length < 8 || password.length > 72) return json({ error: 'Password must be 8-72 characters.' }, 400)
    if (!cities.length || cities.length > 3 || cities.some(city => !VALID_CITIES.includes(city))) {
      return json({ error: 'Select one or more valid cities.' }, 400)
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('login_id', loginId)
      .maybeSingle()
    if (existing) return json({ error: 'This User ID already exists.' }, 409)

    const internalEmail = `${loginId}@users.vrcl.in`
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { login_id: loginId, display_name: displayName },
    })
    if (createError || !created.user) return json({ error: createError?.message || 'Unable to create user.' }, 400)

    const { error: insertError } = await admin.from('profiles').insert({
      id: created.user.id,
      login_id: loginId,
      display_name: displayName,
      role: 'wholesaler',
      city: cities[0],
      allowed_cities: cities,
      active: true,
    })

    if (insertError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: insertError.message }, 400)
    }

    return json({ ok: true, user_id: created.user.id, login_id: loginId, city: cities[0], cities }, 200)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }

  function json(payload: unknown, status: number) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

