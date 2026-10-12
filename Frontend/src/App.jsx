import { BrowserRouter, Route, Routes, Link } from 'react-router-dom'
import Home from './pages/home'
import Admin from './pages/admin'
import Seller from './pages/seller'
import Clerk from './pages/clerk'
import ClerkDashboard from './pages/clerkDashboard'
import AdminDashboard from './pages/adminDashboard'
import SellerDashboard from './pages/sellerDashboard'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <Link to="/" className="brand">ScrapLink</Link>
        <nav className="site-nav">
          <Link to="/seller">Sellers</Link>
          <Link to="/clerk">Scrap Clerks</Link>
          <Link to="/admin">Scrap Admins</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />}/>
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/seller" element={<Seller />} />
        <Route path="/clerk" element={<Clerk />} />
        <Route path="/clerk/dashboard" element={<ClerkDashboard />} />
        <Route path="/seller" element={<Seller />} />
        <Route path="/seller/dashboard" element={<SellerDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
