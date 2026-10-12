import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  getAdminSession,
  logoutAdmin,
  fetchSellers,
  updateSeller,
  deleteSeller,
  fetchClerks,
  fetchDeliveries,
  fetchInspections,
  fetchTransactions,
  fetchScrapPrices,
  registerScrapType,
  updateScrapType,
  replaceScrapImage,
  deleteScrapType,
  mediaUrl,
  fetchCollectionRequests,
  decideCollectionRequest,
  fetchBlacklistReasons,
  fetchBlacklist,
  blacklistSeller,
  liftBlacklist,
  fetchStockSummary,
  fetchAdminProfile,
  updateAdminProfile,
  fetchScrapyardDetails,
  updateScrapyardDetails,
  updateStoredScrapyardName,
} from '../api/admins'
import useLookup from '../hooks/useLookup'
import DataTable from '../components/DataTable'
import '../styles/auth.css'
import '../styles/dashboard.css'

const today = () => new Date().toISOString().slice(0, 10)
const money = (v) => (v == null ? '—' : `R ${Number(v).toFixed(2)}`)
const weight = (v) => (v == null ? '—' : `${Number(v).toFixed(2)} kg`)

/* ---------- shared bits ---------- */

function ReadOnlyField({ label, value }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input type="text" value={value ?? ''} readOnly disabled />
    </label>
  )
}

function SelectField({ label, name, value, onChange, options, loading, placeholder, error }) {
  return (
    <label className={`auth-field ${error ? 'has-error' : ''}`}>
      <span>{label}</span>
      <select name={name} value={value || ''} onChange={onChange} disabled={loading}>
        <option value="">{loading ? 'Loading…' : placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      {error && <em role="alert">{error}</em>}
    </label>
  )
}

/* ---------- generic read-only, searchable list ---------- */

function TabPanel({ tab }) {
  const { options: rows, loading, error } = useLookup(tab.fetcher, [tab.id])
  return <DataTable columns={tab.columns} rows={rows} loading={loading} error={error} />
}

/* ---------- Sellers: search, edit, delete ---------- */

const SELLER_EDIT_FIELDS = [
  { name: 'username', label: 'Username', type: 'text' },
  { name: 'first_name', label: 'First name', type: 'text' },
  { name: 'last_name', label: 'Last name', type: 'text' },
  { name: 'id_number', label: 'ID number', type: 'text' },
  { name: 'age', label: 'Age', type: 'number' },
  { name: 'email_address', label: 'Email address', type: 'email' },
  { name: 'contact_number', label: 'Contact number', type: 'tel' },
  { name: 'physical_address', label: 'Physical address', type: 'text' },
]

function SellersTab({ onSessionEnd }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const { options: rows, loading, error } = useLookup(fetchSellers, [refreshKey])
  const [editing, setEditing] = useState(null)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const startEdit = (row) => {
    setEditing(row)
    setValues({ ...row })
    setErrors({})
    setStatus(null)
  }
  const cancelEdit = () => {
    setEditing(null)
    setValues({})
    setErrors({})
    setStatus(null)
  }

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const validate = () => {
    const er = {}
    SELLER_EDIT_FIELDS.forEach((f) => {
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
      await updateSeller(editing.seller_id, {
        username: values.username.trim(),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        id_number: values.id_number.trim(),
        age: Number(values.age),
        email_address: values.email_address.trim(),
        contact_number: values.contact_number.trim(),
        physical_address: values.physical_address.trim(),
        date_registered: editing.date_registered,
      })
      setStatus({ type: 'success', text: 'Seller updated.' })
      setEditing(null)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (row) => {
    if (!window.confirm(`Delete seller ${row.first_name} ${row.last_name}? This can't be undone.`)) return
    try {
      await deleteSeller(row.seller_id)
      if (editing?.seller_id === row.seller_id) cancelEdit()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      window.alert(err.message)
    }
  }

  return (
    <>
      {editing && (
        <form onSubmit={onSubmit} noValidate className="dash-edit-form">
          <h3 className="dash-subhead" style={{ marginTop: 0 }}>Edit {editing.first_name} {editing.last_name}</h3>
          <div className="auth-grid">
            {SELLER_EDIT_FIELDS.map((f) => (
              <label key={f.name} className={`auth-field ${errors[f.name] ? 'has-error' : ''}`}>
                <span>{f.label}</span>
                <input name={f.name} type={f.type} value={values[f.name] ?? ''} onChange={onChange} />
                {errors[f.name] && <em role="alert">{errors[f.name]}</em>}
              </label>
            ))}
          </div>
          {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
          <div className="dash-edit-actions">
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            <button type="button" className="dash-cancel" onClick={cancelEdit}>Cancel</button>
          </div>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'name', label: 'Name', format: (r) => `${r.first_name} ${r.last_name}` },
          { key: 'id_number', label: 'ID number' },
          { key: 'email_address', label: 'Email' },
          { key: 'contact_number', label: 'Contact' },
          { key: 'date_registered', label: 'Registered' },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        actions={(row) => (
          <>
            <button type="button" className="dash-link" onClick={() => startEdit(row)}>Edit</button>
            <button type="button" className="dash-link danger" onClick={() => onDelete(row)}>Delete</button>
          </>
        )}
      />
    </>
  )
}

/* ---------- Scrap prices: add, edit, delete, search ---------- */

const SCRAP_FIELDS = [
  { name: 'scrap_name', label: 'Scrap name', type: 'text', placeholder: 'Copper' },
  { name: 'unit_price', label: 'Unit price (R/kg)', type: 'number', placeholder: '85.00' },
  { name: 'min_price', label: 'Min price (R/kg)', type: 'number', placeholder: '75.00' },
  { name: 'max_price', label: 'Max price (R/kg)', type: 'number', placeholder: '95.00' },
  { name: 'unit_measure', label: 'Unit', type: 'text', placeholder: 'kg' },
]

function ScrapPricesTab({ scrapyardId, onSessionEnd }) {
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editing, setEditing] = useState(null) // row being edited, or null = add mode
  const [imageFile, setImageFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [fileKey, setFileKey] = useState(0) // remounts the file input so it can be cleared

  const { options: rows, loading, error } = useLookup(fetchScrapPrices, [refreshKey])

  // local preview of the chosen file; revoked when it changes so nothing leaks
  useEffect(() => {
    if (!imageFile) {
      setPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(imageFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const clearImage = () => {
    setImageFile(null)
    setFileKey((k) => k + 1)
  }

  const startEdit = (row) => {
    setEditing(row)
    setValues({ ...row })
    setErrors({})
    setStatus(null)
    clearImage()
  }
  const cancelEdit = () => {
    setEditing(null)
    setValues({})
    setErrors({})
    setStatus(null)
    clearImage()
  }

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const onFile = (e) => {
    const file = e.target.files?.[0] || null
    setErrors((er) => ({ ...er, image: undefined }))
    if (!file) return setImageFile(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors((er) => ({ ...er, image: 'The picture must be a JPG, PNG or WebP image' }))
      return clearImage()
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((er) => ({ ...er, image: 'The picture must be 5 MB or smaller' }))
      return clearImage()
    }
    return setImageFile(file)
  }

  const validate = () => {
    const er = {}
    if (!editing && !imageFile) er.image = 'Choose a picture for this scrap type'
    SCRAP_FIELDS.forEach((f) => {
      if (!(values[f.name] ?? '').toString().trim()) er[f.name] = `${f.label} is required`
    })
    const min = Number(values.min_price)
    const max = Number(values.max_price)
    const price = Number(values.unit_price)
    if (!er.min_price && !er.max_price && min > max) er.max_price = 'Max price must be at least the min price'
    if (!er.unit_price && !er.min_price && !er.max_price && (price < min || price > max)) {
      er.unit_price = 'Unit price should be between the min and max price'
    }
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
      const fields = {
        scrap_name: values.scrap_name.trim(),
        unit_price: Number(values.unit_price),
        min_price: Number(values.min_price),
        max_price: Number(values.max_price),
        unit_measure: values.unit_measure.trim(),
        last_updated: today(),
      }
      let message
      if (editing) {
        // the text details are JSON (scrapyard_id is ignored by the backend; it uses the admin's own yard)
        message = await updateScrapType(editing.scrap_id, { scrapyard_id: Number(scrapyardId), ...fields })
        if (imageFile) {
          try {
            await replaceScrapImage(editing.scrap_id, imageFile)
          } catch (imgErr) {
            if (imgErr.status === 401 || imgErr.status === 403) return onSessionEnd()
            setRefreshKey((k) => k + 1) // the details did save
            setStatus({ type: 'error', text: `Details saved, but the picture could not be updated: ${imgErr.message}` })
            return undefined
          }
        }
      } else {
        // a new scrap type goes up as multipart: the fields plus the picture file
        const form = new FormData()
        Object.entries(fields).forEach(([k, v]) => form.append(k, v))
        form.append('image', imageFile)
        message = await registerScrapType(form)
      }
      setStatus({ type: 'success', text: typeof message === 'string' ? message : (editing ? 'Scrap type updated.' : 'Scrap type added.') })
      setValues({})
      setEditing(null)
      clearImage()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (row) => {
    if (!window.confirm(`Delete "${row.scrap_name}"? This can't be undone.`)) return
    try {
      await deleteScrapType(row.scrap_id)
      if (editing?.scrap_id === row.scrap_id) cancelEdit()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      window.alert(err.message)
    }
  }

  return (
    <>
      <h3 className="dash-subhead" style={{ marginTop: 0 }}>{editing ? `Edit "${editing.scrap_name}"` : 'Add a scrap type'}</h3>
      <form onSubmit={onSubmit} noValidate>
        <div className="auth-grid">
          {SCRAP_FIELDS.map((f) => (
            <label key={f.name} className={`auth-field ${errors[f.name] ? 'has-error' : ''}`}>
              <span>{f.label}</span>
              <input name={f.name} type={f.type} step={f.type === 'number' ? '0.01' : undefined} value={values[f.name] ?? ''} onChange={onChange} placeholder={f.placeholder} />
              {errors[f.name] && <em role="alert">{errors[f.name]}</em>}
            </label>
          ))}
          <label className={`auth-field ${errors.image ? 'has-error' : ''}`} style={{ gridColumn: '1 / -1' }}>
            <span>{editing ? 'Replace picture (optional)' : 'Picture'}</span>
            <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
            {errors.image && <em role="alert">{errors.image}</em>}
            {(preview || (editing && editing.image_path)) && (
              <img className="upload-preview" src={preview || mediaUrl(editing.image_path)} alt="Scrap type preview" />
            )}
          </label>
        </div>
        {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
        <div className="dash-edit-actions">
          <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : editing ? 'Save changes' : 'Add scrap type'}</button>
          {editing && <button type="button" className="dash-cancel" onClick={cancelEdit}>Cancel</button>}
        </div>
      </form>

      <h3 className="dash-subhead">Current prices</h3>
      <DataTable
        columns={[
          {
            key: 'image', label: 'Picture', format: () => '',
            render: (r) => (r.image_path
              ? <img className="scrap-thumb" src={mediaUrl(r.image_path)} alt={r.scrap_name} />
              : <span className="scrap-thumb scrap-thumb-empty">—</span>),
          },
          { key: 'scrap_name', label: 'Scrap type' },
          { key: 'unit_price', label: 'Unit price', format: (r) => money(r.unit_price) },
          { key: 'min_price', label: 'Min price', format: (r) => money(r.min_price) },
          { key: 'max_price', label: 'Max price', format: (r) => money(r.max_price) },
          { key: 'unit_measure', label: 'Unit' },
          { key: 'last_updated', label: 'Last updated' },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        actions={(row) => (
          <>
            <button type="button" className="dash-link" onClick={() => startEdit(row)}>Edit</button>
            <button type="button" className="dash-link danger" onClick={() => onDelete(row)}>Delete</button>
          </>
        )}
      />
    </>
  )
}

/* ---------- Blacklist: add a seller (reason is a select), lift later ---------- */

function BlacklistTab({ onSessionEnd }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const { options: entries, loading, error } = useLookup(fetchBlacklist, [refreshKey])
  const { options: sellers, loading: sellersLoading, error: sellersError } = useLookup(fetchSellers, [])
  const { options: reasons, loading: reasonsLoading, error: reasonsError } = useLookup(fetchBlacklistReasons, [])

  const isActive = (e) => (e.blacklist_status || '').trim().toLowerCase() === 'active'
  const blockedIds = new Set(entries.filter(isActive).map((e) => e.seller_id))

  // sellers already blacklisted at this scrapyard aren't offered again
  const sellerOptions = sellers
    .filter((s) => !blockedIds.has(s.seller_id))
    .map((s) => ({ id: s.seller_id, label: `${s.first_name} ${s.last_name} (${s.id_number})` }))
  const reasonOptions = reasons.map((r) => ({ id: r, label: r }))

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const er = {}
    if (!values.seller_id) er.seller_id = 'Select a seller'
    if (!values.reason) er.reason = 'Select a reason'
    setErrors(er)
    if (Object.keys(er).length) return

    const chosen = sellerOptions.find((o) => String(o.id) === String(values.seller_id))
    if (!window.confirm(`Blacklist ${chosen?.label ?? 'this seller'}? They will no longer be able to schedule collections with, or have deliveries recorded at, your scrapyard.`)) return

    setBusy(true)
    setStatus(null)
    try {
      const message = await blacklistSeller(Number(values.seller_id), values.reason)
      setStatus({ type: 'success', text: typeof message === 'string' ? message : 'Seller blacklisted.' })
      setValues({})
      setRefreshKey((k) => k + 1)
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
    return undefined
  }

  const onLift = async (row) => {
    if (!window.confirm(`Lift the blacklist on ${row.first_name} ${row.last_name}?`)) return
    try {
      await liftBlacklist(row.blacklist_id)
      setStatus({ type: 'success', text: `Blacklist lifted (${row.first_name} ${row.last_name}).` })
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setRefreshKey((k) => k + 1)
    }
    return undefined
  }

  return (
    <>
      <h3 className="dash-subhead" style={{ marginTop: 0 }}>Blacklist a seller</h3>
      <form onSubmit={onSubmit} noValidate>
        <div className="auth-grid">
          <SelectField
            label="Seller" name="seller_id" value={values.seller_id} onChange={onChange}
            options={sellerOptions} loading={sellersLoading} placeholder="Select a seller" error={sellersError || errors.seller_id}
          />
          <SelectField
            label="Reason" name="reason" value={values.reason} onChange={onChange}
            options={reasonOptions} loading={reasonsLoading} placeholder="Select a reason" error={reasonsError || errors.reason}
          />
        </div>
        {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : 'Blacklist seller'}</button>
      </form>

      <h3 className="dash-subhead">Blacklisted at your scrapyard</h3>
      <DataTable
        columns={[
          { key: 'seller', label: 'Seller', format: (r) => `${r.first_name} ${r.last_name}` },
          { key: 'id_number', label: 'ID number' },
          { key: 'contact_number', label: 'Contact' },
          { key: 'reason', label: 'Reason' },
          { key: 'blacklist_status', label: 'Status' },
          { key: 'blacklist_date', label: 'Date' },
        ]}
        rows={entries}
        loading={loading}
        error={error}
        emptyLabel="No sellers have been blacklisted."
        actions={(row) => (isActive(row)
          ? <button type="button" className="dash-link" onClick={() => onLift(row)}>Lift</button>
          : <span>—</span>)}
      />
    </>
  )
}

/* ---------- Collection requests: approve / reject ---------- */

function CollectionRequestsTab({ onSessionEnd }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [status, setStatus] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const { options: rows, loading, error } = useLookup(fetchCollectionRequests, [refreshKey])

  const decide = async (row, decision) => {
    const who = `${row.seller_first_name} ${row.seller_last_name}`
    if (decision === 'rejected' && !window.confirm(`Reject ${who}'s collection request?`)) return
    setBusyId(row.request_id)
    setStatus(null)
    try {
      const message = await decideCollectionRequest(row.request_id, decision)
      setStatus({ type: 'success', text: `${message} (${who}).` })
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusyId(null)
      setRefreshKey((k) => k + 1) // always re-read, in case it was already decided elsewhere
    }
    return undefined
  }

  const isPending = (r) => (r.request_status || '').trim().toLowerCase() === 'pending'

  return (
    <>
      {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
      <DataTable
        columns={[
          { key: 'seller', label: 'Seller', format: (r) => `${r.seller_first_name} ${r.seller_last_name}` },
          { key: 'contact', label: 'Contact' },
          { key: 'scrap_type', label: 'Scrap type' },
          { key: 'estimated_weight', label: 'Est. weight', format: (r) => weight(r.estimated_weight) },
          { key: 'collection_address', label: 'Address' },
          { key: 'collection_date', label: 'Date' },
          { key: 'collection_time', label: 'Time' },
          { key: 'request_status', label: 'Status' },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        emptyLabel="No collection requests yet."
        actions={(row) => (isPending(row) ? (
          <>
            <button type="button" className="dash-link" disabled={busyId === row.request_id} onClick={() => decide(row, 'approved')}>Approve</button>
            <button type="button" className="dash-link danger" disabled={busyId === row.request_id} onClick={() => decide(row, 'rejected')}>Reject</button>
          </>
        ) : <span>—</span>)}
      />
    </>
  )
}

/* ---------- Admin's own profile ---------- */

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

/* ---------- My scrapyard: view and update the yard the admin belongs to ---------- */

const SCRAPYARD_FIELDS = [
  { name: 'scrapyard_name', label: 'Scrapyard name', type: 'text', maxLength: 40, required: true },
  { name: 'email_address', label: 'Email address', type: 'email', maxLength: 60, required: true },
  { name: 'contact_number', label: 'Contact number', type: 'tel', maxLength: 10, required: true, placeholder: '0821234567' },
  { name: 'registration_number', label: 'Registration number', type: 'text', maxLength: 14 },
  { name: 'physical_address', label: 'Physical address', type: 'text', maxLength: 255 },
  { name: 'opening_hour', label: 'Opening hour', type: 'text', maxLength: 10, placeholder: '08:00' },
  { name: 'closing_hour', label: 'Closing hour', type: 'text', maxLength: 10, placeholder: '17:00' },
  { name: 'operating_days', label: 'Operating days', type: 'text', maxLength: 10, placeholder: 'Mon-Fri' },
]

function ScrapyardPanel({ onSessionEnd, onRenamed }) {
  const [values, setValues] = useState(null) // null while loading
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchScrapyardDetails()
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
    SCRAPYARD_FIELDS.forEach((f) => {
      const val = (values[f.name] ?? '').toString().trim()
      if (f.required && !val) er[f.name] = `${f.label} is required`
    })
    const email = (values.email_address ?? '').trim()
    if (!er.email_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) er.email_address = 'Enter a valid email address'
    const phone = (values.contact_number ?? '').trim()
    if (!er.contact_number && !/^\d{10}$/.test(phone)) er.contact_number = 'Enter a 10-digit number with no spaces'
    return er
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const er = validate()
    setErrors(er)
    if (Object.keys(er).length) return

    // blank optional fields are saved as empty (NULL), not as a string of spaces
    const clean = (v) => {
      const t = (v ?? '').toString().trim()
      return t === '' ? null : t
    }
    setBusy(true)
    setStatus(null)
    try {
      const message = await updateScrapyardDetails({
        scrapyard_name: values.scrapyard_name.trim(),
        email_address: clean(values.email_address),
        contact_number: clean(values.contact_number),
        registration_number: clean(values.registration_number),
        physical_address: clean(values.physical_address),
        opening_hour: clean(values.opening_hour),
        closing_hour: clean(values.closing_hour),
        operating_days: clean(values.operating_days),
      })
      updateStoredScrapyardName(values.scrapyard_name.trim())
      onRenamed()
      setStatus({ type: 'success', text: typeof message === 'string' ? message : 'Scrapyard details updated.' })
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
    return undefined
  }

  if (loadError) return <p className="dash-status error">{loadError}</p>
  if (!values) return <p className="dash-status">Loading…</p>

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="auth-grid">
        {SCRAPYARD_FIELDS.map((f) => (
          <label key={f.name} className={`auth-field ${errors[f.name] ? 'has-error' : ''}`}>
            <span>{f.label}</span>
            <input
              name={f.name}
              type={f.type}
              maxLength={f.maxLength}
              placeholder={f.placeholder}
              value={values[f.name] ?? ''}
              onChange={onChange}
            />
            {errors[f.name] && <em role="alert">{errors[f.name]}</em>}
          </label>
        ))}
        <ReadOnlyField label="Scrapyard ID" value={values.scrapyard_id} />
      </div>
      {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  )
}

function AdminProfilePanel({ onSessionEnd }) {
  const [values, setValues] = useState(null) // null while loading
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchAdminProfile()
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
      await updateAdminProfile({
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
    <form onSubmit={onSubmit} noValidate>
      <div className="auth-grid">
        {PROFILE_FIELDS.map((f) => (
          <label key={f.name} className={`auth-field ${errors[f.name] ? 'has-error' : ''}`}>
            <span>{f.label}</span>
            <input name={f.name} type={f.type} value={values[f.name] ?? ''} onChange={onChange} />
            {errors[f.name] && <em role="alert">{errors[f.name]}</em>}
          </label>
        ))}
        <ReadOnlyField label="Scrapyard" value={values.scrapyard_name || `Scrapyard #${values.scrapyard_id}`} />
        <ReadOnlyField label="Registered" value={values.date_registered} />
      </div>
      {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  )
}

/* ---------- tab metadata ---------- */

const PRIMARY_TABS = [
  { id: 'scraps', label: 'Scrap prices' },
  {
    id: 'stock', label: 'Stock', fetcher: fetchStockSummary,
    columns: [
      { key: 'scrap_name', label: 'Scrap type' },
      { key: 'price_per_kg', label: 'Price / kg', format: (r) => money(r.price_per_kg) },
      { key: 'total_weight_kg', label: 'Total weight', format: (r) => weight(r.total_weight_kg) },
      { key: 'amount_spent', label: 'Amount spent', format: (r) => money(r.amount_spent) },
      { key: 'last_update', label: 'Last updated' },
    ],
  },
]

const MENU_TABS = [
  { id: 'requests', label: 'Collection requests' },
  { id: 'blacklist', label: 'Blacklist' },
  { id: 'sellers', label: 'Sellers' },
  {
    id: 'clerks', label: 'Clerks', fetcher: fetchClerks,
    columns: [
      { key: 'name', label: 'Name', format: (r) => `${r.first_name} ${r.last_name}` },
      { key: 'username', label: 'Username' },
      { key: 'email_address', label: 'Email' },
      { key: 'contact_number', label: 'Contact' },
      { key: 'date_registered', label: 'Registered' },
    ],
  },
  {
    id: 'deliveries', label: 'Deliveries', fetcher: fetchDeliveries,
    columns: [
      { key: 'delivery_id', label: 'ID' },
      { key: 'seller', label: 'Seller', format: (r) => `${r.seller_first_name} ${r.seller_last_name}` },
      { key: 'clerk_username', label: 'Clerk' },
      { key: 'scrap_description', label: 'Description' },
      { key: 'estimated_weight', label: 'Est. weight', format: (r) => weight(r.estimated_weight) },
      { key: 'delivery_type', label: 'Type' },
      { key: 'delivery_date', label: 'Date' },
    ],
  },
  {
    id: 'inspections', label: 'Inspections', fetcher: fetchInspections,
    columns: [
      { key: 'inspection_id', label: 'ID' },
      { key: 'delivery_id', label: 'Delivery' },
      { key: 'scrap_name', label: 'Scrap type' },
      { key: 'actual_weight', label: 'Actual weight', format: (r) => weight(r.actual_weight) },
      { key: 'scrap_grade', label: 'Grade' },
      { key: 'unit_price', label: 'Unit price', format: (r) => money(r.unit_price) },
      { key: 'clerk_username', label: 'Clerk' },
      { key: 'inspection_date', label: 'Date' },
    ],
  },
  {
    id: 'transactions', label: 'Transactions', fetcher: fetchTransactions,
    columns: [
      { key: 'transaction_id', label: 'ID' },
      { key: 'seller', label: 'Seller', format: (r) => `${r.seller_first_name} ${r.seller_last_name}` },
      { key: 'clerk_username', label: 'Clerk' },
      { key: 'unit_price', label: 'Unit price', format: (r) => money(r.unit_price) },
      { key: 'total_amount', label: 'Total', format: (r) => money(r.total_amount) },
      { key: 'payment_method', label: 'Payment' },
      { key: 'transaction_ref', label: 'Reference' },
      { key: 'transaction_date', label: 'Date' },
    ],
  },
  { id: 'scrapyard', label: 'My scrapyard' },
  { id: 'profile', label: 'My profile' },
]

const ALL_TABS = [...PRIMARY_TABS, ...MENU_TABS]

/* ---------- shell ---------- */

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('scraps')
  const [menuOpen, setMenuOpen] = useState(false)
  const [, setNameTick] = useState(0) // bumped after a rename so the header re-reads the yard name
  const session = getAdminSession()
  if (!session) return <Navigate to="/admin" replace />

  const { username, scrapyard_id: scrapyardId, scrapyard_name: scrapyardName } = session.admin
  const signOut = () => {
    logoutAdmin()
    navigate('/admin')
  }
  const active = ALL_TABS.find((t) => t.id === tab)
  const selectTab = (id) => {
    setTab(id)
    setMenuOpen(false)
  }

  return (
    <main className="dash">
      <div className="dash-inner">
        <header className="dash-head">
          <div>
            <h1>Admin dashboard</h1>
            <p>Signed in as {username} · {scrapyardName || `Scrapyard #${scrapyardId}`}</p>
          </div>
          <div className="dash-head-actions">
            <div className="dash-menu">
              <button type="button" className="dash-menu-btn" onClick={() => setMenuOpen((o) => !o)}>
                {MENU_TABS.some((t) => t.id === tab) ? active.label : 'Menu'} ▾
              </button>
              {menuOpen && (
                <>
                  <div className="dash-menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="dash-menu-list">
                    {MENU_TABS.map((t) => (
                      <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => selectTab(t.id)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button type="button" className="dash-signout" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <div className="dash-tabs" role="tablist">
          {PRIMARY_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => selectTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <section className="dash-panel" aria-label={active.label}>
          <h2>{active.label}</h2>
          {active.id === 'scraps' && <ScrapPricesTab scrapyardId={scrapyardId} onSessionEnd={signOut} />}
          {active.id === 'requests' && <CollectionRequestsTab onSessionEnd={signOut} />}
          {active.id === 'blacklist' && <BlacklistTab onSessionEnd={signOut} />}
          {active.id === 'sellers' && <SellersTab onSessionEnd={signOut} />}
          {active.id === 'scrapyard' && <ScrapyardPanel onSessionEnd={signOut} onRenamed={() => setNameTick((t) => t + 1)} />}
          {active.id === 'profile' && <AdminProfilePanel onSessionEnd={signOut} />}
          {active.fetcher && <TabPanel key={active.id} tab={active} />}
        </section>
      </div>
    </main>
  )
}