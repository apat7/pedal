'use client';

import { useState, createContext, useContext } from 'react';
import UnifiedMap from '../components/UnifiedMap';
import { Map } from 'lucide-react';
import './dashboard.css'; // Assuming dashboard.css is relevant for the layout as well

// Create context for sharing route data between components
interface RouteData {
  route: [number, number][];
  startLocation?: { name: string; coordinates: [number, number] };
  endLocation?: { name: string; coordinates: [number, number] };
  distance_meters: number;
  estimated_time_minutes: number;
  safety_score: number;
  bike_coverage_percent: number;
  route_type: string;
}

interface DashboardContextType {
  currentRoute: RouteData | null;
  setCurrentRoute: (route: RouteData | null) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardLayout');
  }
  return context;
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const apiKey1 = process.env.NEXT_PUBLIC_MAPTILER_API_KEY_1;
  const apiKey2 = process.env.NEXT_PUBLIC_MAPTILER_API_KEY_2;
  const [currentRoute, setCurrentRoute] = useState<RouteData | null>(null);

  return (
    <DashboardContext.Provider value={{ currentRoute, setCurrentRoute }}>
      <div className="dashboard-layout-container">
        {/* Main Map Container - Background map for general dashboard use */}
        <main className="map-container" style={{ zIndex: 1, pointerEvents: 'auto' }}>
          {apiKey1 && apiKey2 ? (
            <UnifiedMap
              apiKey1={apiKey1}
              apiKey2={apiKey2}
              mode="display"
              route={currentRoute?.route}
              startLocation={currentRoute?.startLocation}
              endLocation={currentRoute?.endLocation}
              showControls={false}
              allowClickToSelect={false}
            />
          ) : (
            <div className="map-placeholder">
              <Map />
              <h3>Interactive Map Framework</h3>
              <p>MapTiler API keys are not configured. Please set NEXT_PUBLIC_MAPTILER_API_KEY_1 and NEXT_PUBLIC_MAPTILER_API_KEY_2 in your .env.local file.</p>
            </div>
          )}
        </main>
        {/* Children content - sidebars and UI elements with proper z-index */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, pointerEvents: 'none' }}>
          {children}
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
