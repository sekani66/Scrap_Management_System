const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// SESSION TOKEN
function tokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export function getClerkSession() {
  const token = sessionStorage.getItem('clerk_token')
  const clerk = JSON.parse(sessionStorage.getItem('clerk_info') || 'null')
  if (!token || !clerk || tokenExpired(token)) {
    logoutClerk()
    return null
  }
  return { token, clerk }
}

export function logoutClerk() {
  sessionStorage.removeItem('clerk_token')
  sessionStorage.removeItem('clerk_info')
}

// requests
function authHeader() {
  const session = getClerkSession()
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
    // FastAPI validation errors come back as { detail: [{ loc, msg }, ...] }
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

// auth routes


export const registerClerk = (person, clerk) =>
  post('/clerks/register/clerk', { person_payload: person, clerk_payload: clerk })

export async function loginClerk(email_address, password) {
  const data = await post('/clerks/login', { email_address, password })
  sessionStorage.setItem('clerk_token', data.token)
  sessionStorage.setItem('clerk_info', JSON.stringify(data.clerk))
  return data
}

export const registerSeller = (person) => post('/clerks/register/seller', person, { auth: true })
export const recordDelivery = (delivery) => post('/clerks/scrap_proccessing/delivery', delivery, { auth: true })
export const recordInspection = (inspection) => post('/clerks/scrap_processing/inspection', inspection, { auth: true })
export const recordTransaction = (transaction) => post('/clerks/scrap_proccessing/transction', transaction, { auth: true })

export const fetchSellers = () => get('/clerks/lookup/sellers', { auth: true })
export const fetchScraps = () => get('/clerks/lookup/scraps', { auth: true })
export const fetchDeliveries = () => get('/clerks/lookup/deliveries', { auth: true })
export const fetchInspections = () => get('/clerks/lookup/inspections', { auth: true })
export const fetchCollectionRequests = (sellerId) =>
  get('/clerks/lookup/collection-requests', { auth: true, params: { seller_id: sellerId } })

//clerk profile

export const fetchClerkProfile = () => get('/clerks/me', { auth: true })
export const updateClerkProfile = (person) => put('/clerks/me', person, { auth: true })
export const updateClerkPassword = (current_password, new_password) =>
  put('/clerks/me/password', { current_password, new_password }, { auth: true })

// scrap prices, view only

export const fetchClerkScrapPrices = () => get('/clerks/scrap-prices', { auth: true })

// registration form scrapyard info
export const fetchScrapyards = () => get('/scrapyards')