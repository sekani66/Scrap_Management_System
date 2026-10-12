import { Link } from 'react-router-dom'
import scrapyard from '../assets/scrapyard.jpg'
import '../styles/home.css'
import '../styles/glass.css'


const ICONS = {
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>,
  banknote: <><rect width="20" height="12" x="2" y="6" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>,
  truck: <><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>,
  shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>,
}
function Icon({ name, size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

const partners = [
  { name: "Scrappy Scrap Metals (PTY) LTD", area: 'East London', metals: ['Steel', 'Iron', 'Copper', 'Aluminium'] },
  { name: "Reclam East London", area: 'East London', metals: ['Copper', 'Brass', 'Aluminium'] },
  { name: 'Inca Metals (Pty) Ltd', area: 'East London', metals: ['Aluminium', 'Copper'] },
  { name: 'Non-Ferrous King', area: 'East London', metals: ['Steel', 'Copper'] },
]

const provinces = [
  { name: 'Eastern Cape', areas: ['Gqeberha', 'East London', 'Mthatha', 'Komani'] },
  { name: 'Gauteng', areas: ['Johannesburg', 'Pretoria', 'Germiston', 'Vereeniging'] },
  { name: 'Western Cape', areas: ['Cape Town', 'Paarl', 'George', 'Stellenbosch'] },
  { name: 'KwaZulu-Natal', areas: ['Durban', 'Pietermaritzburg', 'Richards Bay', 'Ladysmith'] },
  { name: 'Free State', areas: ['Bloemfontein', 'Welkom', 'Bethlehem', 'Sasolburg'] },
  { name: 'Mpumalanga', areas: ['Mbombela', 'Witbank', 'Secunda', 'Middelburg'] },
]

const benefits = [
  'Compare prices from multiple scrap metal buyers',
  'Access to advanced business transactions views network',
  'Request for scrap collections by our scrap yard partners',
  'Get the best price for your scrap metal',
  'Nationwide coverage - find scrap yards near you',
]

const steps = [
  ['Scrap Businesses', 'Record and monitor their business processes.\nGet advanced views grounded from interconnected business processes.'],
  ['Sellers', 'View prices, opening hours and what each yard accepts, schedule collections and take advantage of bulking and loyalty rates tracking'],
]

const why = [
  ['banknote', 'Best Market Rates', 'Compare per-kilogram prices from multiple buyers'],
  ['truck', 'Free Collection', 'Local yards arrange pickup for larger loads'],
  ['shield', 'Licensed Partners', 'Every scrap yard in our network is fully licensed'],
]

export default function Home() {
  return (
    <main>
      <section className="hero" style={{ backgroundImage: `linear-gradient(rgba(20,20,20,.72), rgba(20,20,20,.72)), url(${scrapyard})` }}>
        <div className="container hero-inner">
          <h1>SELL OR MANAGE YOUR SCRAP METAL PROCESSES</h1>
          <p1> Scrap metal buyers manage and compete for sellers copper, steel, aluminium and brass.</p1>
          <p1> Sellers view best priced scraps, arrange collections and leverage bulking rates and loyalty points</p1>
          <div className="hero-feats">
            <div><h3>Best Prices</h3><p>Scrap yards compete to buy your metal</p></div>
            <div><h3>Free Collection</h3><p>Our partners collect from your location</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="title">Our Trusted Scrapyard Partners</h2>
          <div className="grid partners">
            {partners.map((p) => (
              <Link to="/seller" key={p.name} className="card partner">
                <div className="partner-img">{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
                <div className="partner-body">
                  <h3>{p.name}</h3>
                  <span className="loc"><Icon name="pin" size={15} /> {p.area}</span>
                  <div className="tags">{p.metals.map((m) => <span key={m}>{m}</span>)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container two-col">
          <div>
            <h3 className="h3">Why Choose Us?</h3>
            <ul className="checks">{benefits.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
          <div className="card how">
            <h3 className="h3">How It Works</h3>
            {steps.map(([t, d], i) => (
              <div className="step" key={t}>
                <span className="num">{i + 1}</span>
                <div><h4>{t}</h4><p>{d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="title">Why Choose Our Service?</h2>
          <p className="sub">Get the best value for your scrap metal with our premium network</p>
          <div className="grid why">
            {why.map(([icon, t, d]) => (
              <div className="card why-card" key={t}>
                <span className="icon"><Icon name={icon} /></span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <h2 className="title">Find Local Scrap Yards</h2>
          <p className="sub">Nationwide coverage with trusted partners in every province</p>
          <div className="grid provinces">
            {provinces.map((p) => (
              <Link key={p.name} to={`/seller?province=${encodeURIComponent(p.name)}`} className="card province">
                <h3>{p.name}</h3>
                <span>{p.areas.length} Service Areas</span>
                <small>{p.areas.join(' · ')}</small>
                <b>View Locations</b>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">© 2026 ScrapLink – All rights reserved</div>

      </footer>
    </main>
  )
}