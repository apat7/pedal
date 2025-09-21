'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Map, User, LogOut, Info } from 'lucide-react';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';

interface BottomNavBarProps {
  onMapClick?: () => void; // Make optional
}

const BottomNavBar: React.FC<BottomNavBarProps> = ({ onMapClick }) => {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      
      // Clear any cached data and force a clean state
      // Clear localStorage and sessionStorage
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear any service worker caches if they exist
      if ('caches' in window) {
        caches.keys().then(function(names) {
          for (let name of names) {
            caches.delete(name);
          }
        });
      }
      
      // Force a hard reload to the home page to ensure clean state
      window.location.href = '/';
    } catch (error) {
      console.error('Error logging out:', error);
      alert('Failed to log out. Please try again.');
    }
  };

  return (
    <nav className="bottom-nav-bar">
      <Link href="/dashboard" className="nav-item"> {/* Change to Link */}
        <Map size={24} />
        <span>Map</span>
      </Link>
      <Link href="/dashboard/profile" className="nav-item">
        <User size={24} />
        <span>Profile</span>
      </Link>
      <div className="nav-item" onClick={handleLogout}>
        <LogOut size={24} />
        <span>Logout</span>
      </div>
    </nav>
  );
};

export default BottomNavBar;
