import { useNavigate } from 'react-router-dom'
import AuthForm from '../components/AuthForm'
import useLookup from '../hooks/useLookup'
import { registerAdmin, loginAdmin, fetchScrapyards } from '../api/admins'

const BASE_FIELDS = [
  { name: 'username', label: 'Username', type: 'text', placeholder: 'jane.d' },
  { name: 'first_name', label: 'First name', type: 'text', placeholder: 'Jane' },
  { name: 'last_name', label: 'Last name', type: 'text', placeholder: 'Dlamini' },
  { name: 'id_number', label: 'ID number', type: 'text', placeholder: '13-digit SA ID',
    validate: (v) => (/^\d{13}$/.test(v) ? '' : 'ID number must be 13 digits') },
  { name: 'age', label: 'Age', type: 'number', placeholder: '30',
    validate: (v) => (Number.isInteger(+v) && +v >= 18 && +v <= 100 ? '' : 'Enter an age between 18 and 100') },
  { name: 'email_address', label: 'Email address', type: 'email', placeholder: 'you@example.com' },
  { name: 'contact_number', label: 'Contact number', type: 'tel', placeholder: '082 000 0000' },
  { name: 'physical_address', label: 'Physical address', type: 'text', placeholder: '12 Main Rd, Germiston' },
]

async function handleAdminSignUp(v) {
  const person = {
    username: v.username.trim(),
    first_name: v.first_name.trim(),
    last_name: v.last_name.trim(),
    id_number: v.id_number.trim(),
    age: Number(v.age),
    email_address: v.email_address.trim(),
    contact_number: v.contact_number.trim(),
    physical_address: v.physical_address.trim(),
    date_registered: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  }
  const admin = { scrapyard_id: Number(v.scrapyard_id), password: v.password }
  return registerAdmin(person, admin)
}

export default function Admin() {
  const navigate = useNavigate()
  const { options: scrapyards, loading: scrapyardsLoading } = useLookup(fetchScrapyards, [])

  const signUpFields = [
    ...BASE_FIELDS,
    {
      name: 'scrapyard_id',
      label: 'Scrapyard',
      type: 'select',
      loading: scrapyardsLoading,
      options: scrapyards.map((s) => ({ value: s.id, label: s.label })),
    },
  ]

  async function handleAdminSignIn(v) {
    const { admin } = await loginAdmin(v.email.trim(), v.password)
    navigate('/admin/dashboard')
    return `Welcome back, ${admin.username}.`
  }

  return (
    <AuthForm
      role="Admin"
      tagline="Manage scrap yards, clerks and listings."
      signUpFields={signUpFields}
      signUpCommon="password"
      onSignUp={handleAdminSignUp}
      onSignIn={handleAdminSignIn}
    />
  )
}