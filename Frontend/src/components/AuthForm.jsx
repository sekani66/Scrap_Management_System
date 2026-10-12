import { useState } from 'react'
import PasswordField from './PasswordField'
import '../styles/auth.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SIGN_IN_FIELDS = [
  { name: 'email', label: 'Email address', type: 'email', placeholder: 'you@example.com' },
  { name: 'password', label: 'Password', type: 'password', placeholder: 'Your password' },
]

const COMMON_SIGN_UP = [
  { name: 'email', label: 'Email address', type: 'email', placeholder: 'you@example.com' },
  { name: 'password', label: 'Password', type: 'password', placeholder: 'At least 8 characters' },
  { name: 'confirm', label: 'Confirm password', type: 'password', placeholder: 'Repeat password' },
]

const PASSWORD_FIELDS = COMMON_SIGN_UP.slice(1)

/**
 * signUpFields  - role-specific fields. Optional per-field `validate(value) => errorMessage | ''`
 * signUpCommon  - true: add email + password + confirm; 'password': only password + confirm; false: none
 * onSignUp      - async (values) => message; throw an Error to show a failure
 * onSignIn      - async ({ email, password }) => message; throw an Error to show a failure
 */
export default function AuthForm({ role, tagline, signUpFields, signUpCommon = true, onSignUp, onSignIn }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null) // { type: 'success' | 'error', text }
  const [busy, setBusy] = useState(false)

  const signUp = mode === 'signup'
  const fields = signUp
    ? [...signUpFields, ...(signUpCommon === 'password' ? PASSWORD_FIELDS : signUpCommon ? COMMON_SIGN_UP : [])]
    : SIGN_IN_FIELDS

  const switchMode = (next) => {
    setMode(next)
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
    fields.forEach((f) => {
      const val = (values[f.name] || '').trim()
      if (!val) er[f.name] = `${f.label} is required`
      else if (f.type === 'email' && !EMAIL_RE.test(val)) er[f.name] = 'Enter a valid email address'
      else if (f.type === 'tel' && val.replace(/\D/g, '').length < 10) er[f.name] = 'Enter a valid phone number'
      else if (f.validate) {
        const msg = f.validate(val)
        if (msg) er[f.name] = msg
      }
    })
    if (signUp && signUpCommon) {
      if (!er.password && values.password.length < 8) er.password = 'Password must be at least 8 characters'
      if (!er.confirm && values.confirm !== values.password) er.confirm = 'Passwords do not match'
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
      if (signUp && onSignUp) {
        const message = await onSignUp(values)
        setStatus({ type: 'success', text: typeof message === 'string' ? message : 'Registration successful.' })
        setValues({})
      } else if (!signUp && onSignIn) {
        const message = await onSignIn(values)
        setStatus({ type: 'success', text: message || 'Signed in.' })
        setValues((v) => ({ ...v, password: '' }))
      } else {
        // TODO: sign-in request to your backend goes here
        await new Promise((r) => setTimeout(r, 400))
        setStatus({ type: 'success', text: signUp ? 'Registration details received.' : 'Sign-in details received.' })
        if (signUp) setValues({})
      }
    } catch (err) {
      setStatus({ type: 'error', text: err.message || 'Something went wrong. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <span className="auth-role">{role}</span>
        <h1 id="auth-title">{signUp ? `Create ${role.toLowerCase()} account` : `${role} sign in`}</h1>
        <p className="auth-tagline">{signUp ? 'Fill in your details to register.' : tagline}</p>

        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!signUp} className={!signUp ? 'on' : ''} onClick={() => switchMode('signin')}>Sign in</button>
          <button type="button" role="tab" aria-selected={signUp} className={signUp ? 'on' : ''} onClick={() => switchMode('signup')}>Sign up</button>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <div className={signUp ? 'auth-grid' : ''}>
            {fields.map((f) => (
              <label key={f.name} className={`auth-field ${errors[f.name] ? 'has-error' : ''}`}>
                <span>{f.label}</span>
                {f.type === 'select' ? (
                  <select name={f.name} value={values[f.name] || ''} onChange={onChange} disabled={f.loading}>
                    <option value="">{f.loading ? 'Loading…' : 'Select…'}</option>
                    {f.options.map((o) => {
                      const opt = typeof o === 'object' ? o : { value: o, label: o }
                      return <option key={opt.value} value={opt.value}>{opt.label}</option>
                    })}
                  </select>
                ) : f.type === 'password' ? (
                  <PasswordField
                    name={f.name}
                    value={values[f.name] || ''}
                    onChange={onChange}
                    placeholder={f.placeholder}
                    autoComplete={signUp ? 'new-password' : 'current-password'}
                  />
                ) : (
                  <input
                    name={f.name}
                    type={f.type}
                    value={values[f.name] || ''}
                    onChange={onChange}
                    placeholder={f.placeholder}
                    autoComplete={f.type === 'email' ? 'email' : 'on'}
                  />
                )}
                {errors[f.name] && <em role="alert">{errors[f.name]}</em>}
              </label>
            ))}
          </div>

          {status && <p className={`auth-status ${status.type}`} role="status">{status.text}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : signUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          {signUp ? 'Already registered?' : 'New here?'}{' '}
          <button type="button" onClick={() => switchMode(signUp ? 'signin' : 'signup')}>
            {signUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </section>
    </main>
  )
}