import { useNavigate } from 'react-router-dom'
import AuthForm from '../components/AuthForm'
import useLookup from '../hooks/useLookup'
import { registerClerk, loginClerk, fetchScrapyards } from '../api/clerks'

const BASE_FIELDS = [
  { name: 'username', label: 'Username', type: 'text', placeholder: 'thandi.m' },
  { name: 'first_name', label: 'First name', type: 'text', placeholder: 'Thandi' },
  { name: 'last_name', label: 'Last name', type: 'text', placeholder: 'Mokoena' },
  { name: 'id_number', label: 'ID number', type: 'text', placeholder: '13-digit SA ID',
    validate: (v) => (/^\d{13}$/.test(v) ? '' : 'ID number must be 13 digits') },
  { name: 'age', label: 'Age', type: 'number', placeholder: '30',
    validate: (v) => (Number.isInteger(+v) && +v >= 18 && +v <= 100 ? '' : 'Enter an age between 18 and 100') },
  { name: 'email_address', label: 'Email address', type: 'email', placeholder: 'you@example.com' },
  { name: 'contact_number', label: 'Contact number', type: 'tel', placeholder: '082 000 0000' },
  { name: 'physical_address', label: 'Physical address', type: 'text', placeholder: '12 Main Rd, Germiston' },
]

async function handleClerkSignUp(v) {
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
  const clerk = { scrapyard_id: Number(v.scrapyard_id), password: v.password }
  return registerClerk(person, clerk)
}

export default function Clerk() {
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

  async function handleClerkSignIn(v) {
    const { clerk } = await loginClerk(v.email.trim(), v.password)
    navigate('/clerk/dashboard')
    return `Welcome back, ${clerk.username}.`
  }

  return (
    <AuthForm
      role="Clerk"
      tagline="Record and process scrap metal at your yard."
      signUpFields={signUpFields}
      signUpCommon="password"   
      onSignUp={handleClerkSignUp}
      onSignIn={handleClerkSignIn}
    />
  )
}