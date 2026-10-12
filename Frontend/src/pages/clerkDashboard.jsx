import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  getClerkSession,
  logoutClerk,
  registerSeller,
  recordDelivery,
  recordInspection,
  recordTransaction,
  fetchSellers,
  fetchScraps,
  fetchDeliveries,
  fetchInspections,
  fetchCollectionRequests,
  fetchClerkProfile,
  updateClerkProfile,
  updateClerkPassword,
  fetchClerkScrapPrices,
} from '../api/clerks'
import useLookup from '../hooks/useLookup'
import DataTable from '../components/DataTable'
import PasswordField from '../components/PasswordField'
import '../styles/auth.css'
import '../styles/dashboard.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const today = () => new Date().toISOString().slice(0, 10)
const money = (v) => (v == null ? '\u2014' : `R ${Number(v).toFixed(2)}`)

const SELLER_FIELDS = [
  { name: 'username', label: 'Username', type: 'text', placeholder: 'sipho.n' },
  { name: 'first_name', label: 'First name', type: 'text', placeholder: 'Sipho' },
  { name: 'last_name', label: 'Last name', type: 'text', placeholder: 'Nkosi' },
  { name: 'id_number', label: 'ID number', type: 'text', placeholder: '13-digit SA ID',
    validate: (v) => (/^\d{13}$/.test(v) ? '' : 'ID number must be 13 digits') },
  { name: 'age', label: 'Age', type: 'number', placeholder: '30',
    validate: (v) => (Number.isInteger(+v) && +v >= 18 && +v <= 100 ? '' : 'Enter an age between 18 and 100') },
  { name: 'email_address', label: 'Email address', type: 'email', placeholder: 'seller@example.com' },
  { name: 'contact_number', label: 'Contact number', type: 'tel', placeholder: '082 000 0000' },
  { name: 'physical_address', label: 'Physical address', type: 'text', placeholder: '5 Church St, East London' },
]

const PRIMARY_TABS = [
  { id: 'seller', label: 'Register seller' },
  { id: 'delivery', label: 'Record delivery' },
  { id: 'inspection', label: 'Record inspection' },
  { id: 'transaction', label: 'Transaction' },
]

const MENU_TABS = [
  { id: 'scraps', label: 'Scrap prices' },
  { id: 'profile', label: 'My profile' },
]

const ALL_TABS = [...PRIMARY_TABS, ...MENU_TABS]

function ReadOnlyField({ label, value }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input type="text" value={value} readOnly disabled />
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

function SellerForm({ onSessionEnd }) {
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
    SELLER_FIELDS.forEach((f) => {
      const val = (values[f.name] || '').trim()
      if (!val) er[f.name] = `${f.label} is required`
      else if (f.type === 'email' && !EMAIL_RE.test(val)) er[f.name] = 'Enter a valid email address'
      else if (f.type === 'tel' && val.replace(/\D/g, '').length < 10) er[f.name] = 'Enter a valid phone number'
      else if (f.validate) {
        const msg = f.validate(val)
        if (msg) er[f.name] = msg
      }
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
      const v = values
      const message = await registerSeller({
        username: v.username.trim(),
        first_name: v.first_name.trim(),
        last_name: v.last_name.trim(),
        id_number: v.id_number.trim(),
        age: Number(v.age),
        email_address: v.email_address.trim(),
        contact_number: v.contact_number.trim(),
        physical_address: v.physical_address.trim(),
        date_registered: today(),
      })
      setStatus({ type: 'success', text: typeof message === 'string' ? message : 'Seller registered.' })
      setValues({})
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="auth-grid">
        {SELLER_FIELDS.map((f) => (
          <label key={f.name} className={`auth-field ${errors[f.name] ? 'has-error' : ''}`}>
            <span>{f.label}</span>
            <input name={f.name} type={f.type} value={values[f.name] || ''} onChange={onChange} placeholder={f.placeholder} />
            {errors[f.name] && <em role="alert">{errors[f.name]}</em>}
          </label>
        ))}
      </div>
      {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : 'Register seller'}</button>
    </form>
  )
}


function ScrapDelivery({ onSessionEnd, username, clerkId, scrapyardId, scrapyardName }) {
  const [values, setValues] = useState({ delivery_type: 'delivered' })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const { options: sellers, loading: sellersLoading, error: sellersError } = useLookup(fetchSellers, [])

  const isCollected = values.delivery_type === 'collected'
  const { options: requests, loading: requestsLoading } = useLookup(
    () => fetchCollectionRequests(values.seller_id),
    [values.seller_id],
    { skip: !isCollected || !values.seller_id }
  )

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => {
      const next = { ...v, [name]: value }
      if (name === 'delivery_type' && value !== 'collected') next.request_id = ''
      if (name === 'seller_id') next.request_id = ''
      return next
    })
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const validate = () => {
    const er = {}
    if (!values.seller_id) er.seller_id = 'Select a seller'
    if (!(values.scrap_description || '').trim()) er.scrap_description = 'Scrap description is required'
    if (!values.estimated_weight || Number(values.estimated_weight) <= 0) er.estimated_weight = 'Enter a weight greater than 0'
    if (!values.delivery_type) er.delivery_type = 'Select a delivery type'
    if (isCollected && !values.request_id) er.request_id = 'Select the collection request'
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
      const message = await recordDelivery({
        seller_id: Number(values.seller_id),
        clerk_id: Number(clerkId),
        scrapyard_id: Number(scrapyardId),
        scrap_description: values.scrap_description.trim(),
        estimated_weight: Number(values.estimated_weight),
        delivery_type: values.delivery_type,
        request_id: isCollected ? Number(values.request_id) : null,
        delivery_date: today(),
      })
      setStatus({ type: 'success', text: typeof message === 'string' ? message : 'Delivery recorded.' })
      setValues({ delivery_type: 'delivered' })
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="auth-grid">
        <ReadOnlyField label="Clerk" value={username} />
        <ReadOnlyField label="Scrapyard" value={scrapyardName} />

        <SelectField
          label="Seller" name="seller_id" value={values.seller_id} onChange={onChange}
          options={sellers} loading={sellersLoading} placeholder="Select a seller" error={sellersError || errors.seller_id}
        />

        <label className={`auth-field ${errors.scrap_description ? 'has-error' : ''}`}>
          <span>Scrap description</span>
          <input name="scrap_description" type="text" value={values.scrap_description || ''} onChange={onChange} placeholder="Insulated copper cable" />
          {errors.scrap_description && <em role="alert">{errors.scrap_description}</em>}
        </label>

        <label className={`auth-field ${errors.estimated_weight ? 'has-error' : ''}`}>
          <span>Estimated weight (kg)</span>
          <input name="estimated_weight" type="number" step="0.01" min="0" value={values.estimated_weight || ''} onChange={onChange} placeholder="0.0" />
          {errors.estimated_weight && <em role="alert">{errors.estimated_weight}</em>}
        </label>

        <label className={`auth-field ${errors.delivery_type ? 'has-error' : ''}`}>
          <span>Delivery type</span>
          <select name="delivery_type" value={values.delivery_type || ''} onChange={onChange}>
            <option value="delivered">Delivered by seller</option>
            <option value="collected">Collected</option>
          </select>
          {errors.delivery_type && <em role="alert">{errors.delivery_type}</em>}
        </label>

        {isCollected && (
          <SelectField
            label="Collection request" name="request_id" value={values.request_id} onChange={onChange}
            options={requests} loading={requestsLoading} error={errors.request_id}
            placeholder={!values.seller_id ? 'Select a seller first' : 'Select a request'}
            disabled={!values.seller_id}
          />
        )}
      </div>
      {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : 'Record delivery'}</button>
    </form>
  )
}

function ScrapInspections({ onSessionEnd, username, clerkId, scrapyardId, scrapyardName }) {
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const { options: deliveries, loading: deliveriesLoading, error: deliveriesError } = useLookup(fetchDeliveries, [])
  const { options: scraps, loading: scrapsLoading, error: scrapsError } = useLookup(fetchScraps, [])

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const validate = () => {
    const er = {}
    if (!values.delivery_id) er.delivery_id = 'Select a delivery'
    if (!values.scrap_id) er.scrap_id = 'Select a scrap type'
    if (!values.actual_weight || Number(values.actual_weight) <= 0) er.actual_weight = 'Enter a weight greater than 0'
    if (!(values.scrap_grade || '').trim()) er.scrap_grade = 'Scrap grade is required'
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
      const message = await recordInspection({
        delivery_id: Number(values.delivery_id),
        scrapyard_id: Number(scrapyardId),
        clerk_id: Number(clerkId),
        scrap_id: Number(values.scrap_id),
        actual_weight: Number(values.actual_weight),
        scrap_grade: values.scrap_grade.trim(),
        inspection_date: today(),
      })
      setStatus({ type: 'success', text: typeof message === 'string' ? message : 'Inspection recorded.' })
      setValues({})
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="auth-grid">
        <ReadOnlyField label="Clerk" value={username} />
        <ReadOnlyField label="Scrapyard" value={scrapyardName}/>

        <SelectField
          label="Delivery" name="delivery_id" value={values.delivery_id} onChange={onChange}
          options={deliveries} loading={deliveriesLoading} placeholder="Select a delivery" error={deliveriesError || errors.delivery_id}
        />

        <SelectField
          label="Scrap type" name="scrap_id" value={values.scrap_id} onChange={onChange}
          options={scraps} loading={scrapsLoading} placeholder="Select a scrap type" error={scrapsError || errors.scrap_id}
        />

        <label className={`auth-field ${errors.actual_weight ? 'has-error' : ''}`}>
          <span>Actual weight (kg)</span>
          <input name="actual_weight" type="number" step="0.01" min="0" value={values.actual_weight || ''} onChange={onChange} placeholder="0.0" />
          {errors.actual_weight && <em role="alert">{errors.actual_weight}</em>}
        </label>

        <label className={`auth-field ${errors.scrap_grade ? 'has-error' : ''}`}>
          <span>Scrap grade</span>
          <input name="scrap_grade" type="text" value={values.scrap_grade || ''} onChange={onChange} placeholder="Clean" />
          {errors.scrap_grade && <em role="alert">{errors.scrap_grade}</em>}
        </label>
      </div>
      {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : 'Record inspection'}</button>
    </form>
  )
}

function TransactionRecord({ onSessionEnd, username, clerkId, scrapyardId, scrapyardName }) {
  const [values, setValues] = useState({ payment_method: 'Cash' })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState([]) // this session's recorded transactions - clearable, not a DB record

  const { options: inspections, loading: inspectionsLoading, error: inspectionsError } = useLookup(fetchInspections, [])
  const selected = inspections.find((i) => String(i.id) === String(values.inspection_id))

  const onChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
    setErrors((er) => ({ ...er, [name]: undefined }))
  }

  const validate = () => {
    const er = {}
    if (!values.inspection_id) er.inspection_id = 'Select an inspection'
    if (!values.payment_method) er.payment_method = 'Select a payment method'
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
      const result = await recordTransaction({
        inspection_id: Number(values.inspection_id),
        scrapyard_id: Number(scrapyardId),
        clerk_id: Number(clerkId),
        seller_id: Number(selected.seller_id),
        payment_method: values.payment_method,
        transaction_date: today(),
      })
      setStatus({ type: 'success', text: result.message || 'Transaction recorded.' })
      setHistory((h) => [
        {
          transaction_ref: result.transaction_ref,
          seller_label: selected.seller_label,
          scrap_label: selected.label,
          unit_price: result.unit_price,
          bonus_amount: result.bonus_amount,
          total_amount: result.total_amount,
          payment_method: result.payment_method,
          transaction_date: result.transaction_date,
        },
        ...h,
      ])
      setValues({ payment_method: 'Cash' })
    } catch (err) {
      if (err.status === 401 || err.status === 403) return onSessionEnd()
      setStatus({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <div className="auth-grid">
          <ReadOnlyField label="Clerk" value={username} />
          <ReadOnlyField label="Scrapyard" value={scrapyardName} />

          <SelectField
            label="Inspection" name="inspection_id" value={values.inspection_id} onChange={onChange}
            options={inspections} loading={inspectionsLoading} placeholder="Select an inspection" error={inspectionsError || errors.inspection_id}
          />

          <ReadOnlyField label="Seller" value={selected ? selected.seller_label : '—'} />

          <label className={`auth-field ${errors.payment_method ? 'has-error' : ''}`}>
            <span>Payment method</span>
            <select name="payment_method" value={values.payment_method || ''} onChange={onChange}>
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
            {errors.payment_method && <em role="alert">{errors.payment_method}</em>}
          </label>

          {/* Computed by the backend from the selected inspection's unit_price x actual_weight - never entered by hand. */}
          <ReadOnlyField label="Loyalty / bulk bonus" value={selected ? money(selected.bonus_amount) : '—'} />
          <ReadOnlyField label="Total amount (incl. bonus)" value={selected ? money(selected.total_amount) : '—'} />
        </div>
        {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}
        <button type="submit" className="auth-submit" disabled={busy || !selected}>{busy ? 'Please wait…' : 'Record transaction'}</button>
      </form>

      {history.length > 0 && (
        <>
          <div className="dash-summary-head">
            <h3 className="dash-subhead" style={{ marginTop: 0 }}>Transaction summary</h3>
            <button type="button" className="dash-link" onClick={() => setHistory([])}>Clear</button>
          </div>
          <DataTable
            searchable={false}
            columns={[
              { key: 'transaction_ref', label: 'Reference' },
              { key: 'seller_label', label: 'Seller' },
              { key: 'scrap_label', label: 'Scrap' },
              { key: 'unit_price', label: 'Unit price', format: (r) => money(r.unit_price) },
              { key: 'bonus_amount', label: 'Bonus', format: (r) => money(r.bonus_amount) },
              { key: 'total_amount', label: 'Total', format: (r) => money(r.total_amount) },
              { key: 'payment_method', label: 'Payment' },
              { key: 'transaction_date', label: 'Date' },
            ]}
            rows={history}
            loading={false}
            error={null}
          />
        </>
      )}
    </>
  )
}

/* ---------- Scrap prices: view only ---------- */

function ScrapPricesTab() {
  const { options: rows, loading, error } = useLookup(fetchClerkScrapPrices, [])
  return (
    <DataTable
      columns={[
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
    />
  )
}

/* ---------- My profile: edit details + change password ---------- */

const CLERK_PROFILE_FIELDS = [
  { name: 'username', label: 'Username', type: 'text' },
  { name: 'first_name', label: 'First name', type: 'text' },
  { name: 'last_name', label: 'Last name', type: 'text' },
  { name: 'id_number', label: 'ID number', type: 'text' },
  { name: 'age', label: 'Age', type: 'number' },
  { name: 'email_address', label: 'Email address', type: 'email' },
  { name: 'contact_number', label: 'Contact number', type: 'tel' },
  { name: 'physical_address', label: 'Physical address', type: 'text' },
]

function ClerkPasswordForm({ onSessionEnd }) {
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
      await updateClerkPassword(values.current_password, values.new_password)
      setStatus({ type: 'success', text: 'Password updated.' })
      setValues({})
    } catch (err) {
      // A wrong current password is also a 401, but it isn't an expired session -
      // only sign out for the real auth failure.
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

function ClerkProfilePanel({ onSessionEnd }) {
  const [values, setValues] = useState(null) // null while loading
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let alive = true
    fetchClerkProfile()
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
    CLERK_PROFILE_FIELDS.forEach((f) => {
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
      await updateClerkProfile({
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
          {CLERK_PROFILE_FIELDS.map((f) => (
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

      <h3 className="dash-subhead">Change password</h3>
      <ClerkPasswordForm onSessionEnd={onSessionEnd} />
    </>
  )
}

function NotConnected({ title }) {
  return (
    <div className="dash-empty">
      <h3>{title}</h3>
      <p>This section isn't connected to the backend yet.</p>
    </div>
  )
}

export default function ClerkDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('seller')
  const [menuOpen, setMenuOpen] = useState(false)
  const session = getClerkSession()

  if (!session) return <Navigate to="/clerk" replace />

  const { username, clerk_id: clerkId, scrapyard_id: scrapyardId, scrapyard_name: scrapyardName } = session.clerk

  const signOut = () => {
    logoutClerk()
    navigate('/clerk')
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
            <h1>Clerk dashboard</h1>
            <p>Signed in as {username} · {scrapyardName}</p>
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
          {tab === 'seller' && <SellerForm onSessionEnd={signOut} />}
          {tab === 'delivery' && <ScrapDelivery onSessionEnd={signOut} username={username} clerkId={clerkId} scrapyardId={scrapyardId} scrapyardName={scrapyardName} />}
          {tab === 'inspection' && <ScrapInspections onSessionEnd={signOut} username={username} clerkId={clerkId} scrapyardId={scrapyardId} scrapyardName={scrapyardName} />}
          {tab === 'transaction' && <TransactionRecord onSessionEnd={signOut} username={username} clerkId={clerkId} scrapyardId={scrapyardId} scrapyardName={scrapyardName} />}
          {tab === 'scraps' && <ScrapPricesTab />}
          {tab === 'profile' && <ClerkProfilePanel onSessionEnd={signOut} />}
        </section>
      </div>
    </main>
  )
}