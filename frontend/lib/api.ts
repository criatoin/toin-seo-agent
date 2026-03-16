const API = process.env.NEXT_PUBLIC_API_URL

async function fetchApi(path: string, options: RequestInit = {}) {
  const supabase = (await import('./supabase')).createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  return res.json()
}

export const api = {
  get:    (path: string)              => fetchApi(path),
  post:   (path: string, body: unknown)   => fetchApi(path, { method: 'POST',   body: JSON.stringify(body) }),
  patch:  (path: string, body: unknown)   => fetchApi(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (path: string)              => fetchApi(path, { method: 'DELETE' }),
}
