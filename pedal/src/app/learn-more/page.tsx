'use client';
import React, { useEffect } from 'react';
import './learn-more.css';

const LearnMorePage = () => {
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
            <a href='/'>
              <span>Pedal</span>
            </a>
          </div>
          <div className="nav-links">
            <a href="/#features">Features</a>
            <a href="/#impact">Impact</a>
            <a href="/#community">Community</a>
            <a href="/#contact">Contact</a>
            <a href="/login" className="nav-cta">Login</a>
          </div>
        </div>
      </nav>
      <div className="learn-more-container">
        <h1>How Pedal Works</h1>
        <p>
          Pedal is a web application designed to help users find safe and efficient routes for cycling,
          especially in urban environments. It leverages crime data and other factors to calculate
          risk scores for different areas, allowing cyclists to choose routes that minimize exposure
          to high-risk zones.
        </p>
        <h2>Key Features:</h2>
        <ul>
          <li>
            <strong>Route Planning:</strong> Users can input their start and end destinations, and Pedal
            will generate optimal routes.
          </li>
          <li>
            <strong>Risk Assessment:</strong> The application integrates crime data (e.g., from IndianapolisCrime.csv)
            and potentially other environmental factors to create a "risk grid" (backend/risk_grid.py).
            This grid assigns a risk score to different geographical areas.
          </li>
          <li>
            <strong>Interactive Maps:</strong> Visualizations of routes and risk areas are provided
            through interactive maps (e.g., InteractiveMap.tsx, AnimatedMap.tsx), allowing users to
            understand the safety profile of their journey.
          </li>
          <li>
            <strong>User Authentication:</strong> Secure login and profile management (pedal/src/app/login/page.tsx,
            pedal/src/app/dashboard/profile/page.tsx) are handled, likely using Firebase (pedal/src/firebase.ts).
          </li>
          <li>
            <strong>Backend Services:</strong> A Python backend (backend/main.py) handles the core
            logic for graph traversal (backend/graph.py), risk calculation, and data processing.
            It uses models (backend/models.py) to represent geographical data and weights (backend/weights.py)
            to influence risk calculations.
          </li>
        </ul>
        <h2>Technical Overview:</h2>
        <p>
          The frontend is built with Next.js and React, providing a dynamic and responsive user interface.
          It communicates with a Flask-based Python backend. The backend processes geographical data,
          calculates optimal paths based on risk, and serves this information to the frontend.
          Firebase is used for user authentication and potentially for storing user-specific data.
        </p>
        <p>
          The application aims to provide a safer cycling experience by making data-driven route
          recommendations, empowering cyclists to make informed decisions about their journeys.
        </p>
      </div>
    </>
  );
};

export default LearnMorePage;
