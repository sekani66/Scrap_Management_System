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

export function getAdminSession() {
  const token = sessionStorage.getItem('admin_token')
  const admin = JSON.parse(sessionStorage.getItem('admin_info') || 'null')
  if (!token || !admin || tokenExpired(token)) {
    logoutAdmin()
    return null
  }
  return { token, admin }
}

export function logoutAdmin() {
  sessionStorage.removeItem('admin_token')
  sessionStorage.removeItem('admin_info')
}

/* ---------- requests ---------- */
function authHeader() {
  const session = getAdminSession()
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

async function get(path, { auth = false } = {}) {
  const headers = auth ? authHeader() : {}
  let res
  try {
    res = await fetch(`${API_URL}${path}`, { headers })
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

async function del(path, { auth = false } = {}) {
  const headers = auth ? authHeader() : {}
  let res
  try {
    res = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers })
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running.')
  }
  return handle(res)
}

// POST /admins/register/admin  (two body models, embedded by parameter name)
export const registerAdmin = (person, admin) =>
  post('/admins/register/admin', { person_payload: person, admin_payload: admin })

// POST /admins/login -> { token, admin: { admin_id, username, scrapyard_id } }
export async function loginAdmin(email_address, password) {
  const data = await post('/admins/login', { email_address, password })
  sessionStorage.setItem('admin_token', data.token)
  sessionStorage.setItem('admin_info', JSON.stringify(data.admin))
  return data
}

/* ---------- dashboard views (all need an admin token) ---------- */

export const fetchSellers = () => get('/admins/sellers', { auth: true })
export const fetchClerks = () => get('/admins/clerks', { auth: true })
export const fetchDeliveries = () => get('/admins/deliveries', { auth: true })
export const fetchInspections = () => get('/admins/inspections', { auth: true })
export const fetchTransactions = () => get('/admins/transactions', { auth: true })

// Multipart upload (for pictures). No Content-Type header on purpose: the browser
// sets it, including the boundary the server needs.
async function sendForm(method, path, formData) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers: authHeader(), body: formData })
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running.')
  }
  return handle(res)
}

// Pictures are files on the server; the API only gives back a relative path.
export const mediaUrl = (path) => (path ? `${API_URL}/media/${path}` : null)

// POST /admins/register/scrap_type - multipart: the text fields plus an `image` file.
// (The backend always uses the admin's scrapyard.)
export const registerScrapType = (formData) => sendForm('POST', '/admins/register/scrap_type', formData)

// PUT /admins/scraps/{id}/image - replace a scrap type's picture
export const replaceScrapImage = (scrapId, file) => {
  const fd = new FormData()
  fd.append('image', file)
  return sendForm('PUT', `/admins/scraps/${scrapId}/image`, fd)
}

export const fetchScrapPrices = () => get('/admins/scraps', { auth: true })
export const fetchStockSummary = () => get('/admins/stock-summary', { auth: true })

/* ---------- edit / delete (all need an admin token) ---------- */

export const updateSeller = (sellerId, person) => put(`/admins/sellers/${sellerId}`, person, { auth: true })
export const deleteSeller = (sellerId) => del(`/admins/sellers/${sellerId}`, { auth: true })

export const updateScrapType = (scrapId, scrap) => put(`/admins/scraps/${scrapId}`, scrap, { auth: true })
export const deleteScrapType = (scrapId) => del(`/admins/scraps/${scrapId}`, { auth: true })

/* ---------- admin's own profile ---------- */

export const fetchAdminProfile = () => get('/admins/me', { auth: true })
export const updateAdminProfile = (person) => put('/admins/me', person, { auth: true })

/* ---------- public, no login needed (used on the registration form) ---------- */

export const fetchScrapyards = () => get('/scrapyards')

/* ---------- collection requests: approve / reject ---------- */

export const fetchCollectionRequests = () => get('/admins/collection-requests', { auth: true })
export const decideCollectionRequest = (requestId, status) =>
  put(`/admins/collection-requests/${requestId}/status`, { status }, { auth: true })

/* ---------- blacklist ---------- */

export const fetchBlacklistReasons = () => get('/admins/blacklist-reasons', { auth: true })
export const fetchBlacklist = () => get('/admins/blacklist', { auth: true })
export const blacklistSeller = (seller_id, reason) => post('/admins/blacklist', { seller_id, reason }, { auth: true })
export const liftBlacklist = (blacklistId) => put(`/admins/blacklist/${blacklistId}/lift`, {}, { auth: true })

/* ---------- the admin's own scrapyard: view and update its details ---------- */

export const fetchScrapyardDetails = () => get('/admins/scrapyard', { auth: true })
export const updateScrapyardDetails = (details) => put('/admins/scrapyard', details, { auth: true })

// The dashboard header reads the yard's name from the login session.
export function updateStoredScrapyardName(name) {
  const info = JSON.parse(sessionStorage.getItem('admin_info') || 'null')
  if (info) sessionStorage.setItem('admin_info', JSON.stringify({ ...info, scrapyard_name: name }))
}