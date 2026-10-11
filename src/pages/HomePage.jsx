// src/pages/HomePage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/auth';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const categories = [
    {
      icon: '🐍',
      title: 'Python Programming',
      description: 'Master Python from basics to advanced. Learn data structures, algorithms, Django, Flask, and automation.',
      color: '#3776ab',
      skills: ['Python Basics', 'Data Science', 'Django', 'Automation']
    },
    {
      icon: '💾',
      title: 'Database Management',
      description: 'SQL, PostgreSQL, MongoDB, MySQL. Design, optimize, and manage databases for any project.',
      color: '#336791',
      skills: ['SQL', 'PostgreSQL', 'MongoDB', 'Database Design']
    },
    {
      icon: '🌐',
      title: 'Web Development',
      description: 'React, Vue, Node.js, full-stack development. Build responsive, modern web applications from scratch.',
      color: '#61dafb',
      skills: ['React', 'Node.js', 'HTML/CSS', 'JavaScript']
    },
    {
      icon: '💻',
      title: 'IT & Coding',
      description: 'JavaScript, Java, C++, algorithms, data structures. Master programming fundamentals and CS concepts.',
      color: '#f7df1e',
      skills: ['JavaScript', 'Algorithms', 'Data Structures', 'Java']
    }
  ];

  const features = [
    {
      icon: '📅',
      title: 'Flexible Scheduling',
      description: 'Book lessons at times that work for you. Real-time availability makes scheduling a breeze.'
    },
    {
      icon: '👨‍🏫',
      title: 'Expert Tutors',
      description: 'Learn from professional developers with real-world industry experience.'
    },
    {
      icon: '💷',
      title: 'Fair Pricing',
      description: 'Tutors set their own competitive hourly rates. Quality education at affordable prices.'
    },
    {
      icon: '🎯',
      title: 'Personalized Learning',
      description: 'One-on-one instruction tailored to your goals, skill level, and learning pace.'
    }
  ];

  const stats = [
    { number: '200+', label: 'Expert Tutors' },
    { number: '5,000+', label: 'Lessons Completed' },
    { number: '98%', label: 'Satisfaction Rate' },
    { number: '£20-50', label: 'Avg. Hourly Rate' }
  ];

  return (
    <div className="home-page">
      {/* Navigation */}
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-container">
          <div className="nav-logo" onClick={() => navigate('/')}>
            <span className="logo-icon">🎓</span>
            <span className="logo-text">TutorHub</span>
          </div>
          <div className="nav-links">
            <a href="#categories" className="nav-link">Subjects</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#pricing" className="nav-link">Pricing</a>
            {user ? (
              <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
                Dashboard
              </button>
            ) : (
              <div className="nav-auth">
                <button className="btn btn-text" onClick={() => navigate('/login')}>
                  Log In
                </button>
                <button className="btn btn-primary" onClick={() => navigate('/register')}>
                  Get Started
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-badge">
              <span>🏆</span> Trusted by 5,000+ Students
            </div>
            <h1 className="hero-title">
              Learn <span className="gradient-text">IT & Coding</span><br/>
              From Expert Tutors
            </h1>
            <p className="hero-subtitle">
              Master Python, Web Development, Database Management, and more with personalized 
              one-on-one lessons. Book experienced tutors instantly with flexible scheduling.
            </p>
            <div className="hero-cta">
              <button 
                className="btn btn-primary btn-hero"
                onClick={() => navigate('/register')}>
                Find Your Tutor →
              </button>
            </div>
            <div className="hero-trust">
              <div className="trust-item">
                <span className="trust-icon">✓</span> Verified Tutors
              </div>
              <div className="trust-item">
                <span className="trust-icon">✓</span> Secure Payment
              </div>
              <div className="trust-item">
                <span className="trust-icon">✓</span> Money-Back Guarantee
              </div>
            </div>
          </div>
          
          <div className="hero-visual">
            <div className="code-window">
              <div className="code-window-header">
                <div className="window-dots">
                  <span className="dot red"></span>
                  <span className="dot yellow"></span>
                  <span className="dot green"></span>
                </div>
                <div className="window-title">lesson.py</div>
              </div>
              <div className="code-content">
                <pre>{`# Your journey starts here
class TechCareer:
    def __init__(self):
        self.skills = []
        
    def book_tutor(self, subject):
        tutor = find_expert(subject)
        self.skills.append(subject)
        return "Learning started! 🚀"

# Start your success story
me = TechCareer()
me.book_tutor("Python")`}</pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="stats-bar">
        <div className="stats-container">
          {stats.map((stat, index) => (
            <div key={index} className="stat-item">
              <div className="stat-number">{stat.number}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories Section */}
      <section className="categories" id="categories">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">What You Can Learn</h2>
            <p className="section-subtitle">
              Expert instruction in the most in-demand tech skills
            </p>
          </div>
          
          <div className="categories-grid">
            {categories.map((category, index) => (
              <div 
                key={index} 
                className="category-card"
                style={{ '--accent-color': category.color }}
              >
                <div className="category-icon-wrapper">
                  <span className="category-icon">{category.icon}</span>
                </div>
                <h3 className="category-title">{category.title}</h3>
                <p className="category-description">{category.description}</p>
                <div className="category-skills">
                  {category.skills.map((skill, idx) => (
                    <span key={idx} className="skill-tag">{skill}</span>
                  ))}
                </div>
                <button 
                  className="btn btn-category"
                  onClick={() => navigate(`/tutors?category=${encodeURIComponent(category.title)}`)}
                >
                  Browse Tutors →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Why Students Love TutorHub</h2>
            <p className="section-subtitle">Everything you need for successful learning</p>
          </div>
          
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-it-works-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">Get started in 4 simple steps</p>
          </div>
          
          <div className="steps-timeline">
            <div className="step-card">
              <div className="step-number">01</div>
              <div className="step-content">
                <h3>Create Your Account</h3>
                <p>Sign up for free in seconds. No credit card required to browse tutors.</p>
              </div>
            </div>

            <div className="step-connector"></div>

            <div className="step-card">
              <div className="step-number">02</div>
              <div className="step-content">
                <h3>Find Your Perfect Tutor</h3>
                <p>Browse profiles, read reviews, and compare rates. Filter by subject and availability.</p>
              </div>
            </div>

            <div className="step-connector"></div>

            <div className="step-card">
              <div className="step-number">03</div>
              <div className="step-content">
                <h3>Book & Pay Securely</h3>
                <p>Select a time slot that works for you and pay securely with PayPal.</p>
              </div>
            </div>

            <div className="step-connector"></div>

            <div className="step-card">
              <div className="step-number">04</div>
              <div className="step-content">
                <h3>Start Learning</h3>
                <p>Attend your lesson, get homework, track progress, and achieve your goals!</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>About TutorHub</h4>
              <p>Connecting students with expert tutors for personalized learning experiences.</p>
            </div>
            
            <div className="footer-section">
              <h4>Quick Links</h4>
              <ul>
                <li><a href="#categories">Subjects</a></li>
                <li><a href="#how-it-works">How It Works</a></li>
                <li><a href="/">Home</a></li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h4>Contact</h4>
              <p>Email: scott@scott-hw.online</p>
              <p>Phone: +44 (0)7858 575 621</p>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>&copy; 2026 TutorHub. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
