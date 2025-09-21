'use client';
import { useEffect } from 'react';
import AnimatedMap from './components/AnimatedMap';

export default function Home() {
  useEffect(() => {
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const href = anchor.getAttribute('href');
            if (href) {
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                (entry.target as HTMLElement).style.animation = 'slideInUp 0.8s ease forwards';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .stat-card, .testimonial-card').forEach(el => {
        observer.observe(el);
    });

    // Dynamic navigation background on scroll
    window.addEventListener('scroll', () => {
        const nav = document.querySelector('nav');
        if (nav) {
            if (window.scrollY > 100) {
                nav.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
            } else {
                nav.style.boxShadow = 'none';
            }
        }
    });
  }, []);

  return (
    <>
      {/* Navigation */}
      <nav>
        <div className="nav-container">
          <div className="logo">
            <a href="">
              <span>Pedal</span>
            </a>
          </div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#impact">Impact</a>
            <a href="#community">Community</a>
            <a href="#contact">Contact</a>
            <a href="/login" className="nav-cta">Login</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-content">
            <h1>Get There Safer.<br />Go Greener.</h1>
            <p>Smart walking and biking routes that keep you safe and reduce your carbon footprint.</p>
            <div className="cta-container">
              <a href="/login" className="primary-cta">Plan Your First Route</a>
              <a href="/learn-more" className="secondary-cta">Learn More</a>
            </div>
          </div>
          <div className="hero-visual">
            <AnimatedMap />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="features-container">
          <div className="features-header">
            <h2>Smarter Routes for Safer Cities</h2>
            <p>Our intelligent routing system combines real-time data with community insights to keep you safe while reducing emissions.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h3>Crime-Aware Routing</h3>
              <p>Avoid unsafe neighborhoods with real-time crime data integration. Our algorithm analyzes recent incidents to suggest the safest paths for your journey.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🚴</div>
              <h3>Dedicated Lane Optimization</h3>
              <p>Prioritize streets with bike lanes and pedestrian-friendly paths. We find routes that keep you separated from traffic whenever possible.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🌱</div>
              <h3>Eco Impact Tracking</h3>
              <p>See exactly how much carbon you save by biking or walking instead of driving. Track your environmental impact over time.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚙️</div>
              <h3>Customizable Routes</h3>
              <p>Choose your priority: safety, speed, or scenic views. Our flexible routing adapts to your preferences and comfort level.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">👥</div>
              <h3>Community Alerts</h3>
              <p>Get notified of road closures, hazards, or unsafe areas reported by other users. Help make your city safer for everyone.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">‼️</div>
              <h3>Crowdsourced Safety</h3>
              <p>Post alerts about unsafe areas or hazards in your community, signaling everyone to avoid them. Automatically integrated with our routing system.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <h2>Join the Green Commute Movement</h2>
        <p>Start planning safer, eco-friendly routes today and be part of the solution for cleaner, safer cities.</p>
        <a href="/login" className="primary-cta">Plan Your First Route</a>
      </section>

      {/* Footer */}
      <footer id="contact">
        <div className="footer-container">
          <div className="footer-column">
            <h4>Product</h4>
            <a href="#">Features</a>
            <a href="#">Pricing</a>
            <a href="#">API Access</a>
            <a href="#">Mobile Apps</a>
          </div>
          <div className="footer-column">
            <h4>Company</h4>
            <a href="#">About Us</a>
            <a href="#">Careers</a>
            <a href="#">Press</a>
            <a href="#">Blog</a>
          </div>
          <div className="footer-column">
            <h4>Community</h4>
            <a href="#">User Stories</a>
            <a href="#">Safety Tips</a>
            <a href="#">City Partners</a>
            <a href="#">Report an Issue</a>
          </div>
          <div className="footer-column">
            <h4>Connect</h4>
            <a href="#">contact@pedal.com</a>
            <a href="#">Twitter</a>
            <a href="#">Instagram</a>
            <a href="#">LinkedIn</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 Pedal. Building safer, greener cities one route at a time.</p>
        </div>
      </footer>
    </>
  );
}
