import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom';
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import PublicNavbar from '@/components/shared/PublicNavbar'
import './AboutPage.css'

const hods = [
  {
    name: 'Dr. M. Suresh',
    department: 'Computer Science and Engineering',
    qualification: 'Ph.D., M.Tech',
    experience: '18 Years',
    email: 'hod.cse@aits.edu.in',
    image:
      'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Dr. K. Anitha',
    department: 'CSE (Data Science)',
    qualification: 'Ph.D., M.Tech',
    experience: '14 Years',
    email: 'hod.cseds@aits.edu.in',
    image:
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Dr. T. Harikrishna',
    department: 'Electronics and Communication Engineering',
    qualification: 'Ph.D., M.Tech',
    experience: '17 Years',
    email: 'hod.ece@aits.edu.in',
    image:
      'https://images.unsplash.com/photo-1562788869-4ed32648eb72?auto=format&fit=crop&w=700&q=80',
  },
]

const classTeachers = [
  {
    name: 'Mrs. P. Meghana',
    classSection: 'III B.Tech - CSE (DS) A',
    department: 'CSE (Data Science)',
    contact: '+91 98765 11001',
    image:
      'https://images.unsplash.com/photo-1614283233556-f35b0c801ef1?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Mr. V. Arun Kumar',
    classSection: 'III B.Tech - CSE (DS) B',
    department: 'CSE (Data Science)',
    contact: '+91 98765 11002',
    image:
      'https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Mrs. B. Lavanya',
    classSection: 'II B.Tech - CSE A',
    department: 'Computer Science and Engineering',
    contact: '+91 98765 11003',
    image:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=700&q=80',
  },
]

const facultyMembers = [
  {
    name: 'Dr. R. Mahesh',
    subject: 'Data Structures',
    qualification: 'Ph.D.',
    experience: '12 Years',
    department: 'Computer Science and Engineering',
    image:
      'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Ms. D. Bhargavi',
    subject: 'Machine Learning',
    qualification: 'M.Tech',
    experience: '8 Years',
    department: 'CSE (Data Science)',
    image:
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Mr. N. Dinesh',
    subject: 'Compiler Design',
    qualification: 'M.Tech',
    experience: '10 Years',
    department: 'Computer Science and Engineering',
    image:
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Dr. P. Kavitha',
    subject: 'Data Mining',
    qualification: 'Ph.D.',
    experience: '13 Years',
    department: 'CSE (Data Science)',
    image:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Mr. S. Vishal',
    subject: 'Digital Logic Design',
    qualification: 'M.Tech',
    experience: '9 Years',
    department: 'Electronics and Communication Engineering',
    image:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'Ms. A. Revathi',
    subject: 'Operating Systems',
    qualification: 'M.Tech',
    experience: '7 Years',
    department: 'Computer Science and Engineering',
    image:
      'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=700&q=80',
  },
]

const developers = [
  {
    name: 'N. Harshavardhan',
    role: 'Full Stack Developer',
    skills: 'React, Node.js, MongoDB, Express',
    email: 'harsha.dev@aits.edu.in',
    linkedin: 'https://www.linkedin.com',
    github: 'https://github.com',
    bio: 'Focused on scalable dashboard architectures, API integration, and responsive UI engineering.',
    image:
      'https://images.unsplash.com/photo-1557862921-37829c790f19?auto=format&fit=crop&w=700&q=80',
  },
  {
    name: 'P. Sravani',
    role: 'Full Stack Developer',
    skills: 'React, Node.js, MongoDB, Express',
    email: 'sravani.dev@aits.edu.in',
    linkedin: 'https://www.linkedin.com',
    github: 'https://github.com',
    bio: 'Delivered secure authentication workflows, attendance analytics modules, and polished UX flows.',
    image:
      'https://images.unsplash.com/photo-1589571894960-20bbe2828d0a?auto=format&fit=crop&w=700&q=80',
  },
]

const chooseUs = [
  'Excellent Faculty',
  'Smart Attendance System',
  'Placement Support',
  'Innovation Labs',
  'Discipline',
  'Digital Campus',
]

const testimonials = [
  {
    message:
      'The attendance platform has improved transparency and reduced manual effort for both faculty and students.',
    name: 'A. Keerthana',
    role: 'Final Year Student',
  },
  {
    message:
      'Real-time analytics and clear role-based dashboards helped us monitor attendance trends efficiently.',
    name: 'Dr. R. Mahesh',
    role: 'Faculty Coordinator',
  },
  {
    message:
      'This system reflects our institution’s commitment to discipline, innovation, and digital transformation.',
    name: 'Principal Office',
    role: 'Administration',
  },
]

const stats = [
  { label: 'Students', value: 5000, suffix: '+' },
  { label: 'Faculty', value: 300, suffix: '+' },
  { label: 'Departments', value: 10, suffix: '+' },
  { label: 'Placements', value: 90, suffix: '%' },
  { label: 'Years of Excellence', value: 20, suffix: '+' },
]

export default function AboutPage() {
  const [selectedDepartment, setSelectedDepartment] = useState('All')
  const [facultySearch, setFacultySearch] = useState('')
  const [animatedStats, setAnimatedStats] = useState(stats.map(() => 0))

  const departmentOptions = useMemo(() => {
    const departments = new Set(facultyMembers.map((faculty) => faculty.department))
    return ['All', ...Array.from(departments)]
  }, [])

  const filteredFaculty = useMemo(
    () =>
      facultyMembers.filter((faculty) => {
        const matchesDepartment = selectedDepartment === 'All' || faculty.department === selectedDepartment
        const matchesSearch = faculty.name.toLowerCase().includes(facultySearch.toLowerCase())
        return matchesDepartment && matchesSearch
      }),
    [facultySearch, selectedDepartment],
  )

  useEffect(() => {
    const steps = 40
    const duration = 1800
    const interval = duration / steps
    let currentStep = 0

    const counter = setInterval(() => {
      currentStep += 1
      setAnimatedStats(
        stats.map((stat) => Math.floor((stat.value * Math.min(currentStep, steps)) / steps)),
      )

      if (currentStep >= steps) {
        clearInterval(counter)
      }
    }, interval)

    return () => clearInterval(counter)
  }, [])

  return (
    <div className="about-page">
      <PublicNavbar />

      <header className="about-hero">
        <div className="about-hero__overlay" />
        <div className="about-hero__content">
          <p className="about-hero__kicker">About Our Institution</p>
          <h1>Excellence in Education, Innovation, and Discipline</h1>
          <p className="about-hero__highlight">
            This project is created by the Computer Science and Engineering (Data Science) Department.
          </p>
          <div className="about-hero__actions">
            <a href="#overview" className="about-btn about-btn--primary">
              Explore More
            </a>
            <a href="#contact" className="about-btn about-btn--ghost">
              Contact Us
            </a>
          </div>
        </div>
      </header>

      <section className="about-section" id="overview">
        <h2>Annamacharya Institute of Technology and Sciences, Tirupati</h2>
        <p>
          Annamacharya Institute of Technology and Sciences, Tirupati is an established institution known for
          delivering quality education and engineering excellence. With NAAC and NBA accredited programs, the
          institution cultivates academic rigor, innovation culture, and strong placement outcomes. Through
          disciplined mentorship, modern infrastructure, and student-centric development initiatives, the college
          empowers graduates to become confident professionals and responsible contributors to society.
        </p>
      </section>

      <section className="about-section" id="leadership">
        <h2>Institution Leadership</h2>
        <div className="about-grid about-grid--two">
          <article className="glass-card profile-card">
            <img
              src="https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&w=900&q=80"
              alt="Founder Chairman"
            />
            <div>
              <h3>Dr. A. Narayana Reddy</h3>
              <p className="designation">Founder / Chairman</p>
              <blockquote>
                “Education should build character, inspire innovation, and serve society with integrity.”
              </blockquote>
              <p>
                Our vision is to build a transformative institution where every learner receives knowledge,
                discipline, and opportunity to excel globally.
              </p>
            </div>
          </article>

          <article className="glass-card profile-card">
            <img
              src="https://images.unsplash.com/photo-1564564295391-7f24f26f568b?auto=format&fit=crop&w=900&q=80"
              alt="Principal"
            />
            <div>
              <h3>Dr. S. Lakshmi Prasad</h3>
              <p className="designation">Principal</p>
              <p>
                Students are encouraged to combine academic achievement with ethical values, practical learning,
                and collaborative growth.
              </p>
              <p>
                Through committed leadership and faculty mentorship, we ensure every student is prepared for
                higher studies, industry challenges, and lifelong learning.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="about-section">
        <h2>Heads of Departments</h2>
        <div className="about-grid about-grid--three">
          {hods.map((hod) => (
            <article key={hod.email} className="glass-card staff-card">
              <img src={hod.image} alt={hod.name} />
              <h3>{hod.name}</h3>
              <p>{hod.department}</p>
              <p>{hod.qualification}</p>
              <p>{hod.experience}</p>
              <a href={`mailto:${hod.email}`}>{hod.email}</a>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section">
        <h2>Class Teachers</h2>
        <div className="about-grid about-grid--three">
          {classTeachers.map((teacher) => (
            <article key={teacher.contact} className="glass-card staff-card">
              <img src={teacher.image} alt={teacher.name} />
              <h3>{teacher.name}</h3>
              <p>{teacher.classSection}</p>
              <p>{teacher.department}</p>
              <p>{teacher.contact}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section">
        <div className="faculty-heading">
          <h2>Faculty Members</h2>
          <div className="faculty-filter">
            <input
              type="text"
              placeholder="Search faculty by name"
              value={facultySearch}
              onChange={(event) => setFacultySearch(event.target.value)}
            />
            <select
              value={selectedDepartment}
              onChange={(event) => setSelectedDepartment(event.target.value)}
            >
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="about-grid about-grid--three">
          {filteredFaculty.map((faculty) => (
            <article key={faculty.name} className="glass-card staff-card">
              <img src={faculty.image} alt={faculty.name} />
              <h3>{faculty.name}</h3>
              <p>{faculty.subject}</p>
              <p>{faculty.qualification}</p>
              <p>{faculty.experience}</p>
              <p>{faculty.department}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section" id="development">
        <h2>Project Developers</h2>
        <p className="section-note">
          This project is created by the Computer Science and Engineering (Data Science) Department.
        </p>
        <div className="about-grid about-grid--two">
          {developers.map((developer) => (
            <article key={developer.email} className="glass-card developer-card">
              <img src={developer.image} alt={developer.name} />
              <div>
                <h3>{developer.name}</h3>
                <p className="designation">{developer.role}</p>
                <p>
                  <strong>Skills:</strong> {developer.skills}
                </p>
                <p>{developer.bio}</p>
                <a className="icon-link" href={`mailto:${developer.email}`}>
                  <EnvelopeIcon className="small-icon" />
                  {developer.email}
                </a>
                <div className="social-links">
                  <a href={developer.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn">
                    <span className="social-label">in</span>
                  </a>
                  <a href={developer.github} target="_blank" rel="noreferrer" aria-label="GitHub">
                    <span className="social-label">gh</span>
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section">
        <h2>Why Choose Us</h2>
        <div className="about-grid about-grid--three">
          {chooseUs.map((feature) => (
            <article key={feature} className="glass-card feature-chip">
              <h3>{feature}</h3>
              <p>We combine academic quality, digital systems, and student support for holistic growth.</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section about-section--stats">
        <h2>Institution Statistics</h2>
        <div className="stats-grid">
          {stats.map((stat, index) => (
            <article key={stat.label} className="glass-card stats-card">
              <h3>
                {animatedStats[index]}
                {stat.suffix}
              </h3>
              <p>{stat.label}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section">
        <h2>Testimonials</h2>
        <div className="about-grid about-grid--three">
          {testimonials.map((item) => (
            <article key={item.name} className="glass-card testimonial-card">
              <p>“{item.message}”</p>
              <h3>{item.name}</h3>
              <span>{item.role}</span>
            </article>
          ))}
        </div>
      </section>

      <footer className="about-footer" id="contact">
        <div>
          <h3>Annamacharya Institute of Technology and Sciences, Tirupati</h3>
          <p>&copy; {new Date().getFullYear()} Attendance Management System. All rights reserved.</p>
        </div>
        <div>
          <h4>Quick Links</h4>
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <a href="#overview">College</a>
            </li>
            <li>
              <a href="#development">Developers</a>
            </li>
          </ul>
        </div>
        <div>
          <h4>Contact Info</h4>
          <p>Tirupati, Andhra Pradesh</p>
          <p>Phone: +91-XXXXXXXXXX</p>
          <p>Email: info@aits.edu.in</p>
        </div>
      </footer>
    </div>
  )
}
