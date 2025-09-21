'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import { auth } from '@/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import './login.css';

export default function LoginPage() {
  const router = useRouter(); // Initialize useRouter
  const [activeTab, setActiveTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const switchTab = (tab: string) => {
    setActiveTab(tab);
    setError('');
    setSuccess('');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (activeTab === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          await updateProfile(userCredential.user, { displayName: name });
        }
        setSuccess('Account created! You can now log in.');
        setActiveTab('login'); // Switch to login tab after successful signup
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setSuccess('Signed in successfully!');
        router.push('/dashboard'); // Redirect to dashboard
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Cleanup event listeners if needed, though with React's onChange, direct DOM manipulation is less common.
    // This useEffect can be simplified or removed if all form handling moves to React state.
  }, [activeTab]);


  return (
    <div className="login-page-wrapper">
      {/* Background decorations */}
      <div className="bg-decoration bg-decoration-1"></div>
      <div className="bg-decoration bg-decoration-2"></div>
      <div className="bg-decoration bg-decoration-3"></div>

      {/* Main Container */}
      <div className="auth-container">
        {/* Left Panel - Branding */}
        <div className="auth-branding">
          <div className="brand-content">
            <div className="brand-logo">
              <a href='/'>
                <span>Pedal</span>
              </a>
            </div>
            <h1 className="brand-title">Navigate Smarter, Travel Safer</h1>
            <p className="brand-subtitle">Join thousands who've made their daily commute safer and more sustainable.</p>
            <ul className="brand-features">
              <li>Real-time crime data integration</li>
              <li>Dedicated bike lane optimization</li>
              <li>Community-driven safety alerts</li>
              <li>Carbon footprint tracking</li>
            </ul>
          </div>
          {/* Map decoration */}
          <div className="brand-map">
            <div className="map-line" style={{ width: '100%', height: '2px', top: '30%' }}></div>
            <div className="map-line" style={{ width: '100%', height: '2px', top: '60%' }}></div>
            <div className="map-line" style={{ width: '2px', height: '100%', left: '40%' }}></div>
            <div className="map-line" style={{ width: '2px', height: '100%', left: '70%' }}></div>
          </div>
        </div>

        {/* Right Panel - Auth Forms */}
        <div className="auth-form-container">
          {/* Tab Navigation */}
          <div className="auth-tabs">
            <button className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>Log In</button>
            <button className={`auth-tab ${activeTab === 'signup' ? 'active' : ''}`} onClick={() => switchTab('signup')}>Sign Up</button>
          </div>

          {/* Login Form */}
          <div id="login-form" className={`auth-form ${activeTab === 'login' ? 'active' : ''}`}>
            <h2 className="form-title">Welcome back</h2>
            <p className="form-subtitle">Enter your credentials to access your account</p>

            {success && activeTab === 'login' && <div className="success-message show">{success}</div>}
            {error && activeTab === 'login' && <div className="error-message show">{error}</div>}

            <form onSubmit={handleAuth}>
              <div className="form-group">
                <label className="form-label" htmlFor="login-email">Email</label>
                <input
                  type="email"
                  id="login-email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
                <span className="error-message">Please enter a valid email address</span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="login-password">Password</label>
                <input
                  type="password"
                  id="login-password"
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <span className="error-message">Password is required</span>
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                <span className="btn-text">{loading ? 'Logging In...' : 'Log In'}</span>
                <div className="loading"></div>
              </button>
            </form>

            <div className="auth-footer">
              Don't have an account? <a href="#" onClick={() => switchTab('signup')}>Sign up for free</a>
            </div>
          </div>

          {/* Signup Form */}
          <div id="signup-form" className={`auth-form ${activeTab === 'signup' ? 'active' : ''}`}>
            <h2 className="form-title">Create an account</h2>
            <p className="form-subtitle">Start planning safer routes in seconds</p>

            {success && activeTab === 'signup' && <div className="success-message show">{success}</div>}
            {error && activeTab === 'signup' && <div className="error-message show">{error}</div>}

            <form onSubmit={handleAuth}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="first-name">First Name</label>
                  <input
                    type="text"
                    id="first-name"
                    className="form-input"
                    placeholder="John"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                  <span className="error-message">First name is required</span>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="last-name">Last Name</label>
                  <input type="text" id="last-name" className="form-input" placeholder="Doe" required />
                  <span className="error-message">Last name is required</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="signup-email">Email</label>
                <input
                  type="email"
                  id="signup-email"
                  className="form-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
                <span className="error-message">Please enter a valid email address</span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="signup-password">Password</label>
                <input
                  type="password"
                  id="signup-password"
                  className="form-input"
                  placeholder="Create a password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <span className="error-message">Password must be at least 8 characters</span>
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                <span className="btn-text">{loading ? 'Creating Account...' : 'Create Account'}</span>
                <div className="loading"></div>
              </button>
            </form>


            <div className="auth-footer">
              Already have an account? <a href="#" onClick={() => switchTab('login')}>Log in</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
