import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Bars3Icon,
  BellIcon,
  ChevronDownIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/context/AuthContext'
import './PublicNavbar.css'

const GUEST_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/#contact' },
]

const AUTH_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Dashboard', to: '/app' },
]

const isItemActive = (itemTo, pathname) => {
  const itemPath = itemTo.split('#')[0] || '/'

  if (itemPath === '/') {
    return pathname === '/'
  }

  return pathname.startsWith(itemPath)
}

export default function PublicNavbar({ variant = 'default', forceGuestMenu = false, showRegisterButton = true }) {
  const { isAuthenticated, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const profileMenuRef = useRef(null)

  const showAuthenticatedMenu = isAuthenticated && !forceGuestMenu
  const navLinks = useMemo(() => (showAuthenticatedMenu ? AUTH_LINKS : GUEST_LINKS), [showAuthenticatedMenu])

  useEffect(() => {
    setIsMobileOpen(false)
    setIsProfileOpen(false)
  }, [location.pathname, location.hash])

  useEffect(() => {
    if (!location.hash) {
      return
    }

    const elementId = location.hash.slice(1)
    const targetElement = document.getElementById(elementId)

    if (!targetElement) {
      return
    }

    requestAnimationFrame(() => {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.pathname, location.hash])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setIsProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className={`public-navbar ${variant === 'transparent' ? 'public-navbar--transparent' : ''}`} aria-label="Main navigation">
      <div className="public-navbar__container">
        <Link to="/" className="public-navbar__brand" aria-label="Attendance Management System home">
          <img src="/college-logo.png" alt="College logo" className="public-navbar__brand-logo" />
          <span className="public-navbar__brand-text">Attendance Management</span>
        </Link>

        <nav className="public-navbar__desktop-links" aria-label="Primary navigation">
          {navLinks.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) => {
                const isHashActive = !isActive && isItemActive(item.to, location.pathname)
                return `public-navbar__link ${isActive || isHashActive ? 'public-navbar__link--active' : ''}`
              }}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="public-navbar__actions">
          {!showAuthenticatedMenu ? (
            <>
              <Link to="/login" className="public-navbar__login-btn public-navbar__login-btn--ghost">Login</Link>
              
            </>
          ) : (
            <>
              <button
                type="button"
                className="public-navbar__icon-btn"
                aria-label="Notifications"
                onClick={() => setIsProfileOpen(false)}
              >
                <BellIcon className="public-navbar__icon" />
              </button>

              <div className="public-navbar__profile" ref={profileMenuRef}>
                <button
                  type="button"
                  className="public-navbar__profile-btn"
                  onClick={() => setIsProfileOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                >
                  <UserCircleIcon className="public-navbar__avatar" />
                  <span className="public-navbar__profile-name">{user?.name || 'My Account'}</span>
                  <ChevronDownIcon className="public-navbar__chevron" />
                </button>

                {isProfileOpen && (
                  <div className="public-navbar__dropdown" role="menu">
                    <Link to="/profile" className="public-navbar__dropdown-item" role="menuitem">
                      My Profile
                    </Link>
                    <Link to="/change-password" className="public-navbar__dropdown-item" role="menuitem">
                      Settings
                    </Link>
                    <button
                      type="button"
                      className="public-navbar__dropdown-item public-navbar__dropdown-item--danger"
                      onClick={handleLogout}
                      role="menuitem"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <button
            type="button"
            className="public-navbar__menu-btn"
            aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setIsMobileOpen((prev) => !prev)}
          >
            {isMobileOpen ? <XMarkIcon className="public-navbar__icon" /> : <Bars3Icon className="public-navbar__icon" />}
          </button>
        </div>
      </div>

      <div className={`public-navbar__mobile-panel ${isMobileOpen ? 'public-navbar__mobile-panel--open' : ''}`}>
        <nav className="public-navbar__mobile-links" aria-label="Mobile navigation">
          {navLinks.map((item) => (
            <NavLink
              key={`mobile-${item.label}`}
              to={item.to}
              className={({ isActive }) => {
                const isHashActive = !isActive && isItemActive(item.to, location.pathname)
                return `public-navbar__mobile-link ${isActive || isHashActive ? 'public-navbar__mobile-link--active' : ''}`
              }}
            >
              {item.label}
            </NavLink>
          ))}

          {!showAuthenticatedMenu ? (
            <>
              <Link to="/login" className="public-navbar__mobile-cta public-navbar__mobile-cta--ghost">
                Login
              </Link>
              {showRegisterButton ? (
                <Link to="/#contact" className="public-navbar__mobile-cta">
                  Register
                </Link>
              ) : null}
            </>
          ) : (
            <div className="public-navbar__mobile-user-actions">
              <Link to="/profile" className="public-navbar__mobile-link">
                My Profile
              </Link>
              <Link to="/change-password" className="public-navbar__mobile-link">
                Settings
              </Link>
              <button type="button" className="public-navbar__mobile-link" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
