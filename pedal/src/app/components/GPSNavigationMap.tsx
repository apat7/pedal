'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Map, Marker, NavigationControl, Source, Layer } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

interface RouteData {
  type: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
  properties: {
    mode: string;
    algorithm: string;
    distance_m: number;
    time_min: number;
    avg_risk: number;
    avg_bike_friendliness: number;
    nodes: number;
    description: string;
  };
}

interface GPSNavigationMapProps {
  apiKey1: string;
  apiKey2: string;
  onRouteGenerated?: (route: RouteData) => void;
  onNavigationStart?: (route: RouteData) => void;
}

const GPSNavigationMap: React.FC<GPSNavigationMapProps> = ({ 
  apiKey1, 
  apiKey2, 
  onRouteGenerated,
  onNavigationStart 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const [zoom] = useState(14);
  const [latitude] = useState(40.4237); // Purdue University latitude
  const [longitude] = useState(-86.9212); // Purdue University longitude
  
  // Navigation state
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [endPoint, setEndPoint] = useState<[number, number] | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [routingMode, setRoutingMode] = useState('balanced');
  const [availableModes, setAvailableModes] = useState<Record<string, any>>({});
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [navigationInstructions, setNavigationInstructions] = useState<string[]>([]);

  // API base URL
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // Load available routing modes
  useEffect(() => {
    const loadModes = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/modes`);
        if (response.ok) {
          const modes = await response.json();
          setAvailableModes(modes);
        }
      } catch (error) {
        console.error('Failed to load routing modes:', error);
      }
    };
    loadModes();
  }, [API_BASE_URL]);

  // Initialize map
  useEffect(() => {
    const selectedApiKey = Math.random() < 0.5 ? apiKey1 : apiKey2;

    if (map.current) return;

    if (mapContainer.current) {
      map.current = new Map({
        container: mapContainer.current,
        apiKey: selectedApiKey,
        center: [longitude, latitude],
        zoom: zoom,
        style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=X2FBBczzVc6JM7294LYL',
        attributionControl: false,
      });

      // Enable interactions
      map.current.scrollZoom.enable();
      map.current.doubleClickZoom.enable();
      map.current.boxZoom.enable();
      map.current.dragPan.enable();
      map.current.keyboard.enable();
      map.current.touchZoomRotate.enable();

      // Add click handler for route points
      map.current.on('click', (e) => {
        if (isNavigating) return; // Don't allow route changes during navigation
        
        const { lng, lat } = e.lngLat;
        
        if (!startPoint) {
          setStartPoint([lng, lat]);
          // Add start marker
          new Marker({ color: '#22c55e' })
            .setLngLat([lng, lat])
            .setPopup(new (window as any).maptilersdk.Popup().setHTML('<div><strong>Start Point</strong></div>'))
            .addTo(map.current!);
        } else if (!endPoint) {
          setEndPoint([lng, lat]);
          // Add end marker
          new Marker({ color: '#ef4444' })
            .setLngLat([lng, lat])
            .setPopup(new (window as any).maptilersdk.Popup().setHTML('<div><strong>End Point</strong></div>'))
            .addTo(map.current!);
        }
      });
    }

    return () => {
      map.current?.remove();
    };
  }, [apiKey1, apiKey2, latitude, longitude, zoom, isNavigating]);

  // Generate route
  const generateRoute = useCallback(async () => {
    if (!startPoint || !endPoint) {
      alert('Please select both start and end points on the map');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start: startPoint,
          end: endPoint,
          mode: routingMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const routeData: RouteData = await response.json();
      setCurrentRoute(routeData);
      
      // Generate navigation instructions
      const instructions = generateNavigationInstructions(routeData);
      setNavigationInstructions(instructions);
      
      // Add route to map
      if (map.current) {
        // Remove existing route layer if it exists
        if (map.current.getLayer('route')) {
          map.current.removeLayer('route');
        }
        if (map.current.getSource('route')) {
          map.current.removeSource('route');
        }

        // Add new route
        map.current.addSource('route', {
          type: 'geojson',
          data: routeData,
        });

        map.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': getRouteColor(routingMode),
            'line-width': 6,
            'line-opacity': 0.8,
          },
        });

        // Fit map to route bounds
        const coordinates = routeData.geometry.coordinates;
        if (coordinates.length > 0) {
          const bounds = coordinates.reduce(
            (bounds, coord) => bounds.extend(coord as [number, number]),
            new (window as any).maptilersdk.LngLatBounds(coordinates[0], coordinates[0])
          );
          map.current.fitBounds(bounds, { padding: 50 });
        }
      }

      if (onRouteGenerated) {
        onRouteGenerated(routeData);
      }
    } catch (error) {
      console.error('Failed to generate route:', error);
      alert('Failed to generate route. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [startPoint, endPoint, routingMode, API_BASE_URL, onRouteGenerated]);

  // Generate navigation instructions
  const generateNavigationInstructions = (route: RouteData): string[] => {
    const instructions = [];
    const coords = route.geometry.coordinates;
    
    if (coords.length < 2) return ['Route generated successfully'];
    
    instructions.push(`Start at your current location`);
    
    // Calculate total distance and time
    const distance = route.properties.distance_m;
    const time = route.properties.time_min;
    
    if (distance > 1000) {
      instructions.push(`Continue for ${(distance / 1000).toFixed(1)} km (${time.toFixed(0)} minutes)`);
    } else {
      instructions.push(`Continue for ${distance.toFixed(0)} meters (${time.toFixed(0)} minutes)`);
    }
    
    // Add mode-specific instructions
    const mode = route.properties.mode;
    if (mode === 'safest' || mode === 'very_safe') {
      instructions.push('Following safest route - avoiding high-crime areas');
    } else if (mode === 'bike_friendly' || mode === 'very_bike_friendly') {
      instructions.push('Following bike-friendly route - using bike lanes and paths');
    } else if (mode === 'balanced') {
      instructions.push('Following balanced route - optimizing for safety and bike infrastructure');
    }
    
    instructions.push(`Arrive at your destination`);
    
    return instructions;
  };

  // Start navigation
  const startNavigation = () => {
    if (!currentRoute) {
      alert('Please generate a route first');
      return;
    }
    
    setIsNavigating(true);
    setCurrentStep(0);
    
    if (onNavigationStart) {
      onNavigationStart(currentRoute);
    }
    
    // Auto-advance through instructions
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= navigationInstructions.length - 1) {
          clearInterval(interval);
          setIsNavigating(false);
          return prev;
        }
        return prev + 1;
      });
    }, 5000); // Change instruction every 5 seconds
  };

  // Stop navigation
  const stopNavigation = () => {
    setIsNavigating(false);
    setCurrentStep(0);
  };

  // Clear route
  const clearRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setCurrentRoute(null);
    setNavigationInstructions([]);
    setIsNavigating(false);
    setCurrentStep(0);
    
    if (map.current) {
      // Remove route layer
      if (map.current.getLayer('route')) {
        map.current.removeLayer('route');
      }
      if (map.current.getSource('route')) {
        map.current.removeSource('route');
      }
      
      // Remove markers
      map.current.getContainer().querySelectorAll('.maplibregl-marker').forEach(marker => {
        marker.remove();
      });
    }
  };

  // Get route color based on mode
  const getRouteColor = (mode: string): string => {
    const colors: Record<string, string> = {
      fastest: '#3b82f6',      // Blue
      safest: '#22c55e',       // Green
      bike_friendly: '#f59e0b', // Orange
      balanced: '#8b5cf6',     // Purple
      very_safe: '#10b981',    // Emerald
      very_bike_friendly: '#f97316', // Orange-600
    };
    return colors[mode] || '#6b7280'; // Gray default
  };

  return (
    <div className="gps-navigation-container">
      {/* Map */}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
      {/* GPS Navigation Controls */}
      <div className="gps-controls">
        <div className="gps-header">
          <h3>🗺️ GPS Navigation</h3>
          <div className="gps-status">
            {isNavigating ? (
              <span className="status-navigating">📍 Navigating</span>
            ) : (
              <span className="status-ready">📍 Ready</span>
            )}
          </div>
        </div>
        
        {/* Route Planning */}
        {!isNavigating && (
          <div className="route-planning">
            <div className="route-status">
              {!startPoint && <p>Click on map to set start point</p>}
              {startPoint && !endPoint && <p>Click on map to set end point</p>}
              {startPoint && endPoint && (
                <div>
                  <p>Ready to generate route</p>
                  <div className="route-points">
                    <span className="point start">📍 Start: {startPoint[1].toFixed(4)}, {startPoint[0].toFixed(4)}</span>
                    <span className="point end">🎯 End: {endPoint[1].toFixed(4)}, {endPoint[0].toFixed(4)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mode-selector">
              <label htmlFor="routing-mode">Route Type:</label>
              <select 
                id="routing-mode" 
                value={routingMode} 
                onChange={(e) => setRoutingMode(e.target.value)}
              >
                {Object.entries(availableModes).map(([mode, info]) => (
                  <option key={mode} value={mode}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1).replace('_', ' ')} - {info.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="action-buttons">
              <button 
                onClick={generateRoute} 
                disabled={!startPoint || !endPoint || isLoading}
                className="generate-btn"
              >
                {isLoading ? '🔄 Generating...' : '🗺️ Generate Route'}
              </button>
              <button onClick={clearRoute} className="clear-btn">🗑️ Clear</button>
            </div>
          </div>
        )}

        {/* Navigation Mode */}
        {isNavigating && (
          <div className="navigation-mode">
            <div className="current-instruction">
              <h4>📢 {navigationInstructions[currentStep]}</h4>
              <div className="progress">
                Step {currentStep + 1} of {navigationInstructions.length}
              </div>
            </div>
            <button onClick={stopNavigation} className="stop-btn">🛑 Stop Navigation</button>
          </div>
        )}

        {/* Route Information */}
        {currentRoute && (
          <div className="route-info">
            <h4>📊 Route Details</h4>
            <div className="route-stats">
              <div className="stat">
                <span className="label">Distance:</span>
                <span className="value">{(currentRoute.properties.distance_m / 1000).toFixed(2)} km</span>
              </div>
              <div className="stat">
                <span className="label">Time:</span>
                <span className="value">{currentRoute.properties.time_min.toFixed(1)} min</span>
              </div>
              <div className="stat">
                <span className="label">Safety:</span>
                <span className="value">{(1 - currentRoute.properties.avg_risk).toFixed(2)}</span>
              </div>
              <div className="stat">
                <span className="label">Bike Friendly:</span>
                <span className="value">{currentRoute.properties.avg_bike_friendliness.toFixed(2)}</span>
              </div>
            </div>
            
            {!isNavigating && (
              <button onClick={startNavigation} className="navigate-btn">
                🚀 Start Navigation
              </button>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .gps-navigation-container {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .gps-controls {
          position: absolute;
          top: 20px;
          left: 20px;
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          min-width: 320px;
          z-index: 1000;
          backdrop-filter: blur(10px);
        }

        .gps-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #e5e7eb;
        }

        .gps-header h3 {
          margin: 0;
          color: #1f2937;
          font-size: 18px;
        }

        .gps-status {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 6px;
        }

        .status-navigating {
          background: #fef3c7;
          color: #92400e;
        }

        .status-ready {
          background: #d1fae5;
          color: #065f46;
        }

        .route-planning {
          margin-bottom: 15px;
        }

        .route-status {
          margin-bottom: 15px;
          font-size: 14px;
          color: #6b7280;
        }

        .route-points {
          margin-top: 8px;
          font-size: 12px;
        }

        .point {
          display: block;
          margin: 2px 0;
          padding: 2px 6px;
          border-radius: 4px;
          background: #f3f4f6;
        }

        .point.start {
          color: #22c55e;
        }

        .point.end {
          color: #ef4444;
        }

        .mode-selector {
          margin-bottom: 15px;
        }

        .mode-selector label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #374151;
        }

        .mode-selector select {
          width: 100%;
          padding: 8px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
        }

        .generate-btn, .clear-btn, .navigate-btn, .stop-btn {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .generate-btn {
          background: #3b82f6;
          color: white;
        }

        .generate-btn:hover:not(:disabled) {
          background: #2563eb;
        }

        .generate-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .clear-btn {
          background: #ef4444;
          color: white;
        }

        .clear-btn:hover {
          background: #dc2626;
        }

        .navigate-btn {
          background: #10b981;
          color: white;
          width: 100%;
        }

        .navigate-btn:hover {
          background: #059669;
        }

        .stop-btn {
          background: #ef4444;
          color: white;
          width: 100%;
        }

        .stop-btn:hover {
          background: #dc2626;
        }

        .navigation-mode {
          margin-bottom: 15px;
        }

        .current-instruction {
          background: #f0f9ff;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 10px;
          border-left: 4px solid #3b82f6;
        }

        .current-instruction h4 {
          margin: 0 0 5px 0;
          color: #1e40af;
        }

        .progress {
          font-size: 12px;
          color: #6b7280;
        }

        .route-info {
          border-top: 1px solid #e5e7eb;
          padding-top: 15px;
        }

        .route-info h4 {
          margin: 0 0 10px 0;
          color: #1f2937;
          font-size: 16px;
        }

        .route-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 15px;
        }

        .stat {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }

        .stat .label {
          color: #6b7280;
        }

        .stat .value {
          font-weight: 500;
          color: #1f2937;
        }
      `}</style>
    </div>
  );
};

export default GPSNavigationMap;
