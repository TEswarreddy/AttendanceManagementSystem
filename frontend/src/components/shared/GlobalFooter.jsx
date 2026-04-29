import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import './GlobalFooter.css'

export default function GlobalFooter() {
  const { isAuthenticated } = useAuth()

  return (
    <footer className="global-footer" id="contact">
      <div>
        <h4>Annamacharya Institute of Technology and Sciences, Tirupati</h4>
        <p>&copy; {new Date().getFullYear()} Attendance Management System. All rights reserved.</p>
        <p className="global-footer__maintainer">
          This is maintained by the Computer Science and Engineering (Data Science) Department.
        </p>
      </div>
      <div>
        <h5>Quick Links</h5>
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/about">About</Link>
          </li>
          <li>
            <Link to={isAuthenticated ? '/app' : '/login'}>{isAuthenticated ? 'Dashboard' : 'Login'}</Link>
          </li>
        </ul>
      </div>
      <div>
        <h5>Contact Info</h5>
        <p>Phone: +91-XXXXXXXXXX</p>
        <p>Email: info@aits.edu.in</p>
        <p>Tirupati, Andhra Pradesh</p>
      </div>
    </footer>
  )
}
