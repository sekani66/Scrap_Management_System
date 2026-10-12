import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  getSellerSession,
  logoutSeller,
  fetchSellerProfile,
  updateSellerProfile,
  updateSellerPassword,
  fetchSellerScrapPrices,
  fetchScrapyards,
  fetchScrapsForScrapyard,
  submitCollectionRequest,
  fetchMyCollectionRequests,
  mediaUrl,
} from '../api/sellers'
import useLookup from '../hooks/useLookup'
import PasswordField from '../components/PasswordField'
import DataTable from '../components/DataTable'
import aluminiumImg from '../assets/scrap-aluminium.jpg'
import copperImg from '../assets/scrap-copper.jpeg'
import '../styles/auth.css'
import '../styles/dashboard.css'

const money = (v) => (v == null ? '—' : `R ${Number(v).toFixed(2)}`)

// Fallback photos for scrap types that have no uploaded picture (older rows). New scrap
// types carry their own picture from the admin; with neither, a plain initial is shown.
const SCRAP_IMAGES = { aluminium: aluminiumImg, aluminum: aluminiumImg, copper: copperImg }
const scrapImage = (name) => SCRAP_IMAGES[(name || '').trim().toLowerCase()] || null

function ReadOnlyField({ label, value }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input type="text" value={value ?? ''} readOnly disabled />
    </label>
  )
}

function SelectField({ label, name, value, onChange, options, loading, placeholder, disabled, error }) {
  return (
    <label className={`auth-field ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      <select name={name} value={value || ''} onChange={onChange} disabled={disabled || loading}>
        <option value="">{loading ? 'Loading…' : placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      {error && <em role="alert">{error}</em>}
    </label>
  )
}

/* ---------- Scrap prices: illustrated, searchable ---------- */

function ScrapPricesView() {
  const { options: rows, loading, error } = useLookup(fetchSellerScrapPrices, [])
  const [q, setQ] = useState('')

  if (loading) return <p className="dash-status">Loading…</p>
  if (error) return <p className="dash-status error">{error}</p>

  const term = q.trim().toLowerCase()
  const filtered = !term
    ? rows
    : rows.filter((r) => `${r.scrap_name} ${r.scrapyard_name}`.toLowerCase().includes(term))

  return (
    <div>
      {rows.length > 0 && (
        <input
          type="search"
          className="dash-search"
          placeholder="Search scrap type or scrapyard…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      {rows.length === 0 ? (
        <p className="dash-status">No scrap prices published yet.</p>
      ) : filtered.length === 0 ? (
        <p className="dash-status">No rows match your search.</p>
      ) : (
        <div className="scrap-grid">
          {filtered.map((r, i) => {
            const img = mediaUrl(r.image_path) || scrapImage(r.scrap_name) // the admin's uploaded picture wins; the bundled aluminium/copper photos are the fallback
            return (
              <div className="scrap-card" key={`${r.scrap_id}-${r.scrapyard_name}-${i}`}>
                {img ? (
                  <img src={img} alt={r.scrap_name} className="scrap-card-img" />
                ) : (
                  <div className="scrap-card-img scrap-card-placeholder">{(r.scrap_name || '?')[0]}</div>
                )}
                <div className="scrap-card-body">
                  <h3>{r.scrap_name}</h3>
                  <span className="scrap-card-yard">{r.scrapyard_name}</span>
                  <div className="scrap-card-prices">
                    <span className="price-main">{money(r.unit_price)} / {r.unit_measure}</span>
                    <span className="price-range">{money(r.min_price)} – {money(r.max_price)}</span>
                  </div>
                  <small>Updated {r.last_updated}</small>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------- Schedule a scrap collection ---------- */

function CollectionRequestForm({ onSessionEnd, sellerId }) {
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetchSellerProfile()
      .then((data) => {
        if (!alive) return
        setProfile(data)
        setValues((v) => ({ ...v, contact: data.contact_number || '' }))
      })
      .catch((err) => {
        if (!alive) return
        if (err.status === 401 || err.status === 403) return onSessionEnd()
        setProfileError(err.message)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { options: scrapyards, loading: scrapyardsLoading, error: scrapyardsError } = useLookup(fetchScrapyards, [])
  const { options: scrapTypes, loading: scrapTypesLoading } = useLookup(
    () => fetchScrapsForScrapyard(values.scrapyard_id),
    [values.scrapyard_id],
    { skip: !values.scrapyard_id }
  )

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => {
      const next = { ...v, [name]: value }
      if (name === 'scrapyard_id') next.scrap_type = '' // scrap types depend on the chosen scrapyard
      return next
    })
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const validate = () => {
    const er = {}
    if (!values.scrapyard_id) er.scrapyard_id = 'Select a scrapyard'
    if (!(values.contact || '').trim()) er.contact = 'Contact number is required'
    else if (values.contact.replace(/\D/g, '').length < 10) er.contact = 'Enter a valid phone number'
    if (!values.scrap_type) er.scrap_type = 'Select a scrap type'
    if (!values.estimated_weight || Number(values.estimated_weight) <= 0) er.estimated_weight = 'Enter a weight greater than 0'
    if (!(values.collection_address || '').trim()) er.collection_address = 'Collection address is required'
    if (!values.collection_date) er.collection_date = 'Select a collection date'
    if (!values.collection_time) er.collection_time = 'Select a collection time'
    return er
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const er = validate()
    setErrors(er)
    if (Object.keys(er).length) return

    setBusy(true)
    setStatus(null)
    try {
      const message = await submitCollectionRequest({
        scrapyard_id: Number(values.scrapyard_id),
        seller_id: Number(sellerId),
        contact: values.contact.trim(),
        scrap_type: values.scrap_type,
        estimated_weight: Number(values.estimated_weight),
        collection_address: values.collection_address.trim(),
        collection_time: values.collection_time,
        collection_date: values.collection_date,
      })
      setStatus({ type: 'success', text: typeof message === 'string' ? message : 'Collection request submitted.' })
      setValues((v) => ({ contact: v.contact })) // keep contact prefilled, clear the rest
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (profileError) return <p className="dash-status error">{profileError}</p>
  if (!profile) return <p className="dash-status">Loading…</p>

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="auth-grid">
        <ReadOnlyField label="Seller" value={profile.username} />
        <ReadOnlyField label="ID number" value={profile.id_number} />

        <SelectField
          label="Scrapyard" name="scrapyard_id" value={values.scrapyard_id} onChange={onChange}
          options={scrapyards} loading={scrapyardsLoading} placeholder="Select a scrapyard" error={scrapyardsError || errors.scrapyard_id}
        />

        <label className={`auth-field ${errors.contact ? 'has-error' : ''}`}>
          <span>Contact number</span>
          <input name="contact" type="tel" value={values.contact || ''} onChange={onChange} placeholder="082 000 0000" />
          {errors.contact && <em role="alert">{errors.contact}</em>}
        </label>

        <SelectField
          label="Scrap type" name="scrap_type" value={values.scrap_type} onChange={onChange}
          options={scrapTypes} loading={scrapTypesLoading} error={errors.scrap_type}
          placeholder={!values.scrapyard_id ? 'Select a scrapyard first' : 'Select a scrap type'}
          disabled={!values.scrapyard_id}
        />

        <label className={`auth-field ${errors.estimated_weight ? 'has-error' : ''}`}>
          <span>Estimated weight (kg)</span>
          <input name="estimated_weight" type="number" step="0.01" min="0" value={values.estimated_weight || ''} onChange={onChange} placeholder="0.0" />
          {errors.estimated_weight && <em role="alert">{errors.estimated_weight}</em>}
        </label>

        <label className={`auth-field ${errors.collection_address ? 'has-error' : ''}`}>
          <span>Collection address</span>
          <input name="collection_address" type="text" value={values.collection_address || ''} onChange={onChange} placeholder="5 Church St, East London" />
          {errors.collection_address && <em role="alert">{errors.collection_address}</em>}
        </label>

        <label className={`auth-field ${errors.collection_date ? 'has-error' : ''}`}>
          <span>Collection date</span>
          <input name="collection_date" type="date" value={values.collection_date || ''} onChange={onChange} />
          {errors.collection_date && <em role="alert">{errors.collection_date}</em>}
        </label>

        <label className={`auth-field ${errors.collection_time ? 'has-error' : ''}`}>
          <span>Collection time</span>
          <input name="collection_time" type="time" value={values.collection_time || ''} onChange={onChange} />
          {errors.collection_time && <em role="alert">{errors.collection_time}</em>}
        </label>
      </div>
      {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Submitting…' : 'Request collection'}</button>
    </form>
  )
}

/* ---------- My requests: history of collection requests, status set by admin ---------- */

function CollectionHistoryView() {
  const { options: rows, loading, error } = useLookup(fetchMyCollectionRequests, [])
  return (
    <DataTable
      columns={[
        { key: 'scrapyard_name', label: 'Scrapyard' },
        { key: 'scrap_type', label: 'Scrap type' },
        { key: 'estimated_weight', label: 'Est. weight', format: (r) => (r.estimated_weight == null ? '—' : `${Number(r.estimated_weight).toFixed(2)} kg`) },
        { key: 'collection_address', label: 'Address' },
        { key: 'collection_date', label: 'Date' },
        { key: 'collection_time', label: 'Time' },
        { key: 'request_status', label: 'Status' },
      ]}
      rows={rows}
      loading={loading}
      error={error}
      emptyLabel="You haven't scheduled any collections yet."
    />
  )
}

/* ---------- My profile: edit details (not bulk/loyalty points) + password ---------- */

const PROFILE_FIELDS = [
  { name: 'username', label: 'Username', type: 'text' },
  { name: 'first_name', label: 'First name', type: 'text' },
  { name: 'last_name', label: 'Last name', type: 'text' },
  { name: 'id_number', label: 'ID number', type: 'text' },
  { name: 'age', label: 'Age', type: 'number' },
  { name: 'email_address', label: 'Email address', type: 'email' },
  { name: 'contact_number', label: 'Contact number', type: 'tel' },
  { name: 'physical_address', label: 'Physical address', type: 'text' },
]

function SellerPasswordForm({ onSessionEnd }) {
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const validate = () => {
    const er = {}
    if (!values.current_password) er.current_password = 'Enter your current password'
    if (!values.new_password || values.new_password.length < 8) er.new_password = 'New password must be at least 8 characters'
    if (values.confirm !== values.new_password) er.confirm = 'Passwords do not match'
    return er
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const er = validate()
    setErrors(er)
    if (Object.keys(er).length) return

    setBusy(true)
    setStatus(null)
    try {
      await updateSellerPassword(values.current_password, values.new_password)
      setStatus({ type: 'success', text: 'Password updated.' })
      setValues({})
    } catch (err) {
      // A wrong current password is also a 401, but it isn't an expired session.
      if (err.status === 401 && err.message !== 'Current password is incorrect.') return onSessionEnd()
      if (err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="auth-grid">
        <label className={`auth-field ${errors.current_password ? 'has-error' : ''}`}>
          <span>Current password</span>
          <PasswordField name="current_password" value={values.current_password || ''} onChange={onChange} autoComplete="current-password" />
          {errors.current_password && <em role="alert">{errors.current_password}</em>}
        </label>
        <label className={`auth-field ${errors.new_password ? 'has-error' : ''}`}>
          <span>New password</span>
          <PasswordField name="new_password" value={values.new_password || ''} onChange={onChange} autoComplete="new-password" />
          {errors.new_password && <em role="alert">{errors.new_password}</em>}
        </label>
        <label className={`auth-field ${errors.confirm ? 'has-error' : ''}`}>
          <span>Confirm new password</span>
          <PasswordField name="confirm" value={values.confirm || ''} onChange={onChange} autoComplete="new-password" />
          {errors.confirm && <em role="alert">{errors.confirm}</em>}
        </label>
      </div>
      {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
    </form>
  )
}

function SellerProfilePanel({ onSessionEnd }) {
  const [values, setValues] = useState(null) // null while loading
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchSellerProfile()
      .then((data) => alive && setValues(data))
      .catch((err) => {
        if (!alive) return
        if (err.status === 401 || err.status === 403) return onSessionEnd()
        setLoadError(err.message)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const validate = () => {
    const er = {}
    PROFILE_FIELDS.forEach((f) => {
      if (!(values[f.name] ?? '').toString().trim()) er[f.name] = `${f.label} is required`
    })
    return er
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const er = validate()
    setErrors(er)
    if (Object.keys(er).length) return

    setBusy(true)
    setStatus(null)
    try {
      // bulk_points and loyalty_points are never sent - the backend ignores
      // them even if they were, but this keeps the payload honest too.
      await updateSellerProfile({
        username: values.username.trim(),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        id_number: values.id_number.trim(),
        age: Number(values.age),
        email_address: values.email_address.trim(),
        contact_number: values.contact_number.trim(),
        physical_address: values.physical_address.trim(),
      })
      setStatus({ type: 'success', text: 'Profile updated.' })
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="dash-status error">{loadError}</p>
  if (!values) return <p className="dash-status">Loading…</p>

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <div className="auth-grid">
          {PROFILE_FIELDS.map((f) => (
            <label key={f.name} className={`auth-field ${errors[f.name] ? 'has-error' : ''}`}>
              <span>{f.label}</span>
              <input name={f.name} type={f.type} value={values[f.name] ?? ''} onChange={onChange} />
              {errors[f.name] && <em role="alert">{errors[f.name]}</em>}
            </label>
          ))}
          <ReadOnlyField label="Bulk points" value={values.bulk_points} />
          <ReadOnlyField label="Loyalty points" value={values.loyalty_points} />
          <ReadOnlyField label="Registered" value={values.date_registered} />
        </div>
        {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>

      <h3 className="dash-subhead">Change password</h3>
      <SellerPasswordForm onSessionEnd={onSessionEnd} />
    </>
  )
}

/* ---------- shell ---------- */

export default function SellerDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('scraps')
  const [menuOpen, setMenuOpen] = useState(false)
  const session = getSellerSession()
  if (!session) return <Navigate to="/seller" replace />

  const { username, seller_id: sellerId } = session.seller
  const signOut = () => {
    logoutSeller()
    navigate('/seller')
  }
  const selectTab = (id) => {
    setTab(id)
    setMenuOpen(false)
  }

  return (
    <main className="dash">
      <div className="dash-inner">
        <header className="dash-head">
          <div>
            <h1>Seller dashboard</h1>
            <p>Signed in as {username}</p>
          </div>
          <div className="dash-head-actions">
            <div className="dash-menu">
              <button type="button" className="dash-menu-btn" onClick={() => setMenuOpen((o) => !o)}>
                {tab === 'collect' ? 'Schedule collection' : tab === 'history' ? 'My requests' : tab === 'profile' ? 'My profile' : 'Menu'} ▾
              </button>
              {menuOpen && (
                <>
                  <div className="dash-menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="dash-menu-list">
                    <button type="button" className={tab === 'collect' ? 'on' : ''} onClick={() => selectTab('collect')}>
                      Schedule collection
                    </button>
                    <button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => selectTab('history')}>
                      My requests
                    </button>
                    <button type="button" className={tab === 'profile' ? 'on' : ''} onClick={() => selectTab('profile')}>
                      My profile
                    </button>
                  </div>
                </>
              )}
            </div>
            <button type="button" className="dash-signout" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <div className="dash-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'scraps'} className={tab === 'scraps' ? 'on' : ''} onClick={() => selectTab('scraps')}>Scrap prices</button>
        </div>

        <section
          className="dash-panel"
          aria-label={tab === 'scraps' ? 'Scrap prices' : tab === 'collect' ? 'Schedule collection' : tab === 'history' ? 'My requests' : 'My profile'}
        >
          <h2>{tab === 'scraps' ? 'Scrap prices' : tab === 'collect' ? 'Schedule a collection' : tab === 'history' ? 'My requests' : 'My profile'}</h2>
          {tab === 'scraps' && <ScrapPricesView />}
          {tab === 'collect' && <CollectionRequestForm onSessionEnd={signOut} sellerId={sellerId} />}
          {tab === 'history' && <CollectionHistoryView />}
          {tab === 'profile' && <SellerProfilePanel onSessionEnd={signOut} />}
        </section>
      </div>
    </main>
  )
}