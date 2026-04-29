import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import PublicNavbar from '@/components/shared/PublicNavbar'
import './HomePage.css'

const features = [
  'Student Attendance Tracking',
  'Faculty Dashboard',
  'HOD Dashboard',
  'Attendance Coordinator',
  'Reports & Analytics',
  'Excel Downloads',
  'Defaulters Tracking',
  'Role Management',
]

export default function HomePage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="home-page">
      <PublicNavbar />

      <header className="college-header" id="home">
        <div className="college-header__logo-wrap" aria-label="Annamacharya Institute logo">
          <img src="/college-logo.png" alt="Annamacharya Institute logo" className="college-header__logo" />
        </div>
        <div className="college-header__content">
          <h1>Annamacharya Institute of Technology and Sciences, Tirupati</h1>
          <h2>(Autonomous)</h2>
          <p>Approved by AICTE, New Delhi &amp; Affiliation to JNTUA, Anantapuramu.</p>
          <p>All the 5 eligible UG Engineering Programs are accredited by NBA, New Delhi</p>
          <p>
            Accredited by NAAC with &apos;A&apos; Grade, Bangalore. Accredited by Institution of Engineers
            (India), KOLKATA.
          </p>
          <p>Recognized under sections 2(f) &amp; 12(B) of UGC Act 1956.</p>
        </div>
      </header>

      <section className="hero" id="about">
        <div className="hero__left">
          <span className="hero__tag">Digital Campus Suite</span>
          <h3>Smart Attendance Management System</h3>
          <p>
            Manage student attendance digitally with reports, analytics, role-based dashboards,
            Excel exports, and automation.
          </p>
          <div className="hero__actions">
            <Link className="btn btn--primary" to={isAuthenticated ? '/app' : '/login'}>
              Login
            </Link>
            <Link className="btn btn--secondary" to="/about">
              Explore About Page
            </Link>
          </div>
        </div>

        <div className="hero__right">
          <div className="hero__image-wrap">
            <img src="/college.png" alt="Attendance dashboard illustration" />
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <h3>Core Features</h3>
        <div className="features__grid">
          {features.map((feature) => (
            <article key={feature} className="feature-card">
              <h4>{feature}</h4>
              <p>Built to simplify workflows and improve institutional visibility.</p>
            </article>
          ))}
        </div>
      </section>

    </div>
  )
}
