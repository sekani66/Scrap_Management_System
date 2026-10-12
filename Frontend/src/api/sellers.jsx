const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/* ---------- session (cleared when the tab closes) ---------- */
function tokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export function getSellerSession() {
  const token = sessionStorage.getItem('seller_token')
  const seller = JSON.parse(sessionStorage.getItem('seller_info') || 'null')
  if (!token || !seller || tokenExpired(token)) {
    logoutSeller()
    return null
  }
  return { token, seller }
}

export function logoutSeller() {
  sessionStorage.removeItem('seller_token')
  sessionStorage.removeItem('seller_info')
}

/* ---------- requests ---------- */
function authHeader() {
  const session = getSellerSession()
  if (!session) {
    const err = new Error('Your session has expired. Please sign in again.')
    err.status = 401
    throw err
  }
  return { Authorization: `Bearer ${session.token}` }
}

async function handle(res) {
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = Array.isArray(data?.detail)
      ? data.detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join(', ')
      : data?.detail
    const err = new Error(detail || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  if (typeof data === 'string' && /^(error|failed)/i.test(data)) throw new Error(data)
  return data
}

async function post(path, body, { auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(auth ? authHeader() : {}) }
  let res
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running.')
  }
  return handle(res)
}

async function get(path, { auth = false, params } = {}) {
  const url = new URL(`${API_URL}${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => v != null && v !== '' && url.searchParams.set(k, v))
  const headers = auth ? authHeader() : {}
  let res
  try {
    res = await fetch(url, { headers })
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running.')
  }
  return handle(res)
}

async function put(path, body, { auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(auth ? authHeader() : {}) }
  let res
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) })
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running.')
  }
  return handle(res)
}

/* ---------- auth ---------- */

// POST /seller/register  (two body models, embedded by parameter name)
export const registerSeller = (person, seller) =>
  post('/seller/register', { person_payload: person, seller_payload: seller })

// POST /seller/login -> { token, seller: { seller_id, username } }
export async function loginSeller(email_address, password) {
  const data = await post('/seller/login', { email_address, password })
  sessionStorage.setItem('seller_token', data.token)
  sessionStorage.setItem('seller_info', JSON.stringify(data.seller))
  return data
}

/* ---------- the signed-in seller's own profile ---------- */

export const fetchSellerProfile = () => get('/seller/me', { auth: true })
export const updateSellerProfile = (person) => put('/seller/me', person, { auth: true })
export const updateSellerPassword = (current_password, new_password) =>
  put('/seller/me/password', { current_password, new_password }, { auth: true })

/* ---------- scrap prices, view only, across every scrapyard ---------- */

export const fetchSellerScrapPrices = () => get('/seller/scrap-prices', { auth: true })

/* ---------- scrap collection requests ---------- */

export const fetchScrapyards = () => get('/scrapyards') // public, no login needed
export const fetchScrapsForScrapyard = (scrapyardId) =>
  get('/seller/scraps', { auth: true, params: { scrapyard_id: scrapyardId } })
export const submitCollectionRequest = (request) => post('/seller/collection-requests', request, { auth: true })
export const fetchMyCollectionRequests = () => get('/seller/collection-requests', { auth: true })

// Scrap pictures are files on the server; the API only gives back a relative path.
export const mediaUrl = (path) => (path ? `${API_URL}/media/${path}` : null)