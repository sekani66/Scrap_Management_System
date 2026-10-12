import { useNavigate } from 'react-router-dom'
import AuthForm from '../components/AuthForm'
import { registerSeller, loginSeller } from '../api/sellers'

const SIGN_UP_FIELDS = [
  { name: 'username', label: 'Username', type: 'text', placeholder: 'sipho.n' },
  { name: 'first_name', label: 'First name', type: 'text', placeholder: 'Sipho' },
  { name: 'last_name', label: 'Last name', type: 'text', placeholder: 'Nkosi' },
  { name: 'id_number', label: 'ID number', type: 'text', placeholder: '13-digit SA ID',
    validate: (v) => (/^\d{13}$/.test(v) ? '' : 'ID number must be 13 digits') },
  { name: 'age', label: 'Age', type: 'number', placeholder: '30',
    validate: (v) => (Number.isInteger(+v) && +v >= 18 && +v <= 100 ? '' : 'Enter an age between 18 and 100') },
  { name: 'email_address', label: 'Email address', type: 'email', placeholder: 'you@example.com' },
  { name: 'contact_number', label: 'Contact number', type: 'tel', placeholder: '082 000 0000' },
  { name: 'physical_address', label: 'Physical address', type: 'text', placeholder: '5 Church St, East London' },
]

async function handleSellerSignUp(v) {
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
  const seller = { password: v.password }
  return registerSeller(person, seller)
}

export default function Seller() {
  const navigate = useNavigate()

  async function handleSellerSignIn(v) {
    const { seller } = await loginSeller(v.email.trim(), v.password)
    navigate('/seller/dashboard')
    return `Welcome back, ${seller.username}.`
  }

  return (
    <AuthForm
      role="Seller"
      tagline="Find scrap metal buyers and sell your metal."
      signUpFields={SIGN_UP_FIELDS}
      signUpCommon="password" 
      onSignUp={handleSellerSignUp}
      onSignIn={handleSellerSignIn}
    />
  )
}