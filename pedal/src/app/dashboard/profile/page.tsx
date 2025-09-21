'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '../../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import BottomNavBar from '../../components/BottomNavBar';
import { User, Mail, Bike, Leaf } from 'lucide-react';
import { useRouter } from 'next/navigation';
import StaticBlurredMap from '../../components/StaticBlurredMap';
import '../dashboard.css';
import './profile.css';

export default function ProfilePage() {
  const MAPTILER_API_KEY_1 = process.env.NEXT_PUBLIC_MAPTILER_API_KEY_1 || '';
  const MAPTILER_API_KEY_2 = process.env.NEXT_PUBLIC_MAPTILER_API_KEY_2 || '';
  const selectedApiKey = Math.random() < 0.5 ? MAPTILER_API_KEY_1 : MAPTILER_API_KEY_2;
  const [user, setUser] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        router.push('/login'); // Redirect to login page if not authenticated
      } else {
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        onValue(userRef, (snapshot) => {
          setProfileData(snapshot.val());
          setLoading(false);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const handleMapClick = () => {
    router.push('/dashboard');
  };

  if (loading) {
    return <div className="dashboard-container">Loading profile...</div>;
  }

  // If user is null, it means they are logged out and being redirected.
  // We should not render the profile content in this state to avoid errors.
  if (!user) {
    return null;
  }

  return (
    <div className="dashboard-container">
      <StaticBlurredMap apiKey={selectedApiKey} className="profile-background-map" />
      <main className="profile-container">
        <div className="profile-header">
          <User size={48} />
          <h1>User Profile</h1>
        </div>

        <div className="profile-info-card">
          <h2>Account Information</h2>
          <div className="info-item">
            <Mail size={20} />
            <strong>Email:</strong> {user.email}
          </div>
          {profileData?.displayName && (
            <div className="info-item">
              <User size={20} />
              <strong>Display Name:</strong> {profileData.displayName}
            </div>
          )}
        </div>

        <div className="profile-info-card">
          <h2>Activity Summary</h2>
          <div className="info-item">
            <Leaf size={20} />
            <strong>CO₂ Emissions Saved:</strong> {profileData?.co2Saved?.toFixed(2) || '0.00'} kg
          </div>
          <div className="info-item">
            <Bike size={20} />
            <strong>Saved Routes:</strong>
            {profileData?.savedRoutes ? (
              <ul>
                {Object.values(profileData.savedRoutes).map((route: any, index: number) => (
                  <li key={index}>
                    {route.start?.name || 'Unknown'} &rarr; {route.end?.name || 'Unknown'} ({route.type})
                  </li>
                ))}
              </ul>
            ) : (
              <span> No saved routes yet.</span>
            )}
          </div>
        </div>
      </main>
      <BottomNavBar onMapClick={handleMapClick} />
    </div>
  );
}
