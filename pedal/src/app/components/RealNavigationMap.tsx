'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Map, Marker, LngLatBounds } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

interface Location {
  name: string;
  coordinates: [number, number]; // [latitude, longitude]
}

interface RouteData {
  route: [number, number][]; // Array of [latitude, longitude] pairs
  distance_meters: number;
  estimated_time_minutes: number;
  safety_score: number;
  bike_coverage_percent: number;
  route_type: string;
  algorithm_used: string;
  calculation_time_ms: number;
  node_count: number;
  error_message: string | null;
}

interface RealNavigationMapProps {
  apiKey1: string;
  apiKey2: string;
  onRouteGenerated?: (route: RouteData) => void;
  onNavigationStart?: (route: RouteData) => void;
}

const RealNavigationMap: React.FC<RealNavigationMapProps> = ({ 
  apiKey1, 
  apiKey2, 
  onRouteGenerated,
  onNavigationStart 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const mapInitializedRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);

  // Navigation state
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [endLocation, setEndLocation] = useState<Location | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [selectedRouteType, setSelectedRouteType] = useState('fastest');
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [navigationInstructions, setNavigationInstructions] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Default center coordinates
  const defaultCenter: [number, number] = [-86.9212, 40.4237];
  const defaultZoom = 14;

  // Route type options
  const routeTypes = [
    { value: 'fastest', label: 'Fastest Route', color: '#3b82f6' },
    { value: 'safe', label: 'Safest Route', color: '#22c55e' },
    { value: 'bike', label: 'Bike Friendly', color: '#f59e0b' },
    { value: 'safe_bike', label: 'Safe + Bike', color: '#8b5cf6' }
  ];

  // Initialize map
  const initializeMap = useCallback(() => {
    if (mapInitializedRef.current || !mapContainer.current) {
      return;
    }

    const selectedApiKey = Math.random() < 0.5 ? apiKey1 : apiKey2;
    
    console.log('🗺️ Initializing RealNavigationMap...');
    
    try {
      map.current = new Map({
        container: mapContainer.current,
        apiKey: selectedApiKey,
        center: defaultCenter,
        zoom: defaultZoom,
        style: 'https://api.maptiler.com/maps/streets-v2/style.json',
        attributionControl: false,
        navigationControl: false,
      });

      mapInitializedRef.current = true;

      // Map event handlers
      map.current.on('load', () => {
        console.log('✅ RealNavigationMap loaded successfully');
        setIsMapReady(true);
        map.current?.resize();
      });
      
      map.current.on('error', (e) => {
        console.error('❌ RealNavigationMap error:', e);
      });

      // Enable map interactions
      map.current.scrollZoom.enable();
      map.current.doubleClickZoom.enable();
      map.current.boxZoom.enable();
      map.current.dragPan.enable();
      map.current.keyboard.enable();
      map.current.touchZoomRotate.enable();

      // Setup resize observer
      const resizeObserver = new ResizeObserver(() => {
        map.current?.resize();
      });

      if (mapContainer.current) {
        resizeObserver.observe(mapContainer.current);
      }

      // Try to get user location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude: userLat, longitude: userLon } = position.coords;
            map.current?.setCenter([userLon, userLat]);
            console.log('📍 Centered on user location');
          },
          (error) => {
            console.log('📍 Using default location (geolocation unavailable)');
            map.current?.setCenter(defaultCenter);
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }

      return () => {
        resizeObserver.disconnect();
        if (map.current) {
          map.current.remove();
          map.current = null;
        }
        mapInitializedRef.current = false;
        setIsMapReady(false);
      };
    } catch (error) {
      console.error('❌ Failed to initialize RealNavigationMap:', error);
    }
  }, [apiKey1, apiKey2]);

  // Initialize map on mount
  useEffect(() => {
    initializeMap();
  }, [initializeMap]);

  // Geocode address to coordinates
  const geocodeAddress = useCallback(async (address: string): Promise<Location | null> => {
    if (!address.trim()) return null;
    
    try {
      const selectedApiKey = Math.random() < 0.5 ? apiKey1 : apiKey2;
      const response = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(address)}.json?key=${selectedApiKey}&limit=1`
      );
      
      if (!response.ok) {
        throw new Error('Geocoding failed');
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        return {
          name: data.features[0].place_name,
          coordinates: [lat, lng] // Convert to [lat, lng] format
        };
      }
      
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }, [apiKey1, apiKey2]);

  // Geocode addresses and set points
  const geocodeAndSetPoints = useCallback(async () => {
    if (!startAddress.trim() || !endAddress.trim()) {
      setError('Please enter both start and end addresses');
      return;
    }

    setIsGeocoding(true);
    setError('');

    try {
      const startLoc = await geocodeAddress(startAddress);
      const endLoc = await geocodeAddress(endAddress);

      if (!startLoc) {
        setError('Could not find start address');
        return;
      }

      if (!endLoc) {
        setError('Could not find end address');
        return;
      }

      setStartLocation(startLoc);
      setEndLocation(endLoc);

      // Add markers to map
      if (map.current && isMapReady) {
        // Remove existing markers
        const existingMarkers = map.current.getContainer().querySelectorAll('.maplibregl-marker');
        existingMarkers.forEach(marker => marker.remove());

        // Add start marker
        new Marker({ color: '#22c55e' })
          .setLngLat([startLoc.coordinates[1], startLoc.coordinates[0]])
          .setPopup(new (window as any).maptilersdk.Popup().setHTML(`<div><strong>Start:</strong><br/>${startLoc.name}</div>`))
          .addTo(map.current);

        // Add end marker
        new Marker({ color: '#ef4444' })
          .setLngLat([endLoc.coordinates[1], endLoc.coordinates[0]])
          .setPopup(new (window as any).maptilersdk.Popup().setHTML(`<div><strong>End:</strong><br/>${endLoc.name}</div>`))
          .addTo(map.current);

        // Fit map to show both points
        const bounds = new LngLatBounds(
          [startLoc.coordinates[1], startLoc.coordinates[0]], 
          [endLoc.coordinates[1], endLoc.coordinates[0]]
        );
        map.current.fitBounds(bounds, { padding: 50 });
      }

    } catch (error) {
      setError('Error geocoding addresses');
    } finally {
      setIsGeocoding(false);
    }
  }, [startAddress, endAddress, geocodeAddress, isMapReady]);

  // Generate route
  const generateRoute = useCallback(async () => {
    if (!startLocation || !endLocation) {
      setError('Please geocode addresses first');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:8000/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_lat: startLocation.coordinates[0],
          start_lon: startLocation.coordinates[1],
          end_lat: endLocation.coordinates[0],
          end_lon: endLocation.coordinates[1],
          route_type: selectedRouteType,
          algorithm: 'dijkstra',
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
      if (map.current && isMapReady) {
        addRouteToMap(routeData);
      }

      if (onRouteGenerated) {
        onRouteGenerated(routeData);
      }

      console.log('✅ Route generated successfully:', routeData);
    } catch (error) {
      console.error('Failed to generate route:', error);
      setError('Failed to generate route. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [startLocation, endLocation, selectedRouteType, isMapReady, onRouteGenerated]);

  // Add route to map
  const addRouteToMap = useCallback((routeData: RouteData) => {
    if (!map.current || !isMapReady) return;

    try {
      // Remove existing route layers
      const layersToRemove = ['route', 'route-outline'];
      const sourcesToRemove = ['route'];
      
      layersToRemove.forEach(layerId => {
        if (map.current?.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      
      sourcesToRemove.forEach(sourceId => {
        if (map.current?.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      });

      // Convert coordinates from [lat, lon] to [lon, lat] for MapTiler
      const routeCoordinates = routeData.route.map(coord => [coord[1], coord[0]]);
      
      // Create route GeoJSON
      const routeGeoJSON = {
        type: 'Feature',
        properties: {
          name: 'Route',
          description: `Generated ${selectedRouteType} route`
        },
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates
        },
      };
      
      // Add route source
      map.current.addSource('route', {
        type: 'geojson',
        data: routeGeoJSON,
      });
      
      // Add route outline layer
      map.current.addLayer({
        id: 'route-outline',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#ffffff',
          'line-width': 10,
          'line-opacity': 0.9,
        },
      });

      // Add main route layer
      const routeType = routeTypes.find(rt => rt.value === selectedRouteType);
      const routeColor = routeType?.color || '#3b82f6';

      map.current.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': routeColor,
          'line-width': 6,
          'line-opacity': 1,
        },
      });

      // Fit map to route bounds
      const bounds = new LngLatBounds();
      routeCoordinates.forEach(coord => bounds.extend(coord as [number, number]));
      
      map.current.fitBounds(bounds, { 
        padding: 80,
        duration: 2000,
        maxZoom: 18,
        minZoom: 8
      });
      
      console.log('✅ Route added to map');
    } catch (error) {
      console.error('❌ Error adding route to map:', error);
    }
  }, [isMapReady, selectedRouteType]);

  // Generate navigation instructions
  const generateNavigationInstructions = (route: RouteData): string[] => {
    const instructions = [];
    
    instructions.push(`Start at ${startLocation?.name || 'your location'}`);
    
    // Calculate total distance and time
    const distance = route.distance_meters;
    const time = route.estimated_time_minutes;
    
    if (distance > 1000) {
      instructions.push(`Continue for ${(distance / 1000).toFixed(1)} km (${time.toFixed(0)} minutes)`);
    } else {
      instructions.push(`Continue for ${distance.toFixed(0)} meters (${time.toFixed(0)} minutes)`);
    }
    
    // Add route type specific instructions
    const routeType = routeTypes.find(rt => rt.value === route.route_type);
    if (routeType) {
      instructions.push(`Following ${routeType.label.toLowerCase()} - optimizing for your selected preferences`);
    }
    
    instructions.push(`Arrive at ${endLocation?.name || 'your destination'}`);
    
    return instructions;
  };

  // Start navigation
  const startNavigation = () => {
    if (!currentRoute) {
      setError('Please generate a route first');
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
    setStartAddress('');
    setEndAddress('');
    setStartLocation(null);
    setEndLocation(null);
    setCurrentRoute(null);
    setNavigationInstructions([]);
    setIsNavigating(false);
    setCurrentStep(0);
    setError('');
    
    if (map.current && isMapReady) {
      // Remove route layers
      const layersToRemove = ['route', 'route-outline'];
      const sourcesToRemove = ['route'];
      
      layersToRemove.forEach(layerId => {
        if (map.current?.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
      });
      
      sourcesToRemove.forEach(sourceId => {
        if (map.current?.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      });
      
      // Remove markers
      const existingMarkers = map.current.getContainer().querySelectorAll('.maplibregl-marker');
      existingMarkers.forEach(marker => marker.remove());
    }
  };

  return (
    <div className="real-navigation-container">
      {/* Map */}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
      {/* Navigation Controls */}
      <div className="real-navigation-controls">
        <div className="nav-header">
          <h3>🗺️ Real Navigation System</h3>
          <div className="nav-status">
            {isNavigating ? (
              <span className="status-navigating">📍 Navigating</span>
            ) : (
              <span className="status-ready">📍 Ready</span>
            )}
          </div>
        </div>
        
        {/* Address Input */}
        {!isNavigating && (
          <div className="address-input">
            <div className="input-group">
              <label htmlFor="start-address">Start Address:</label>
              <input
                id="start-address"
                type="text"
                value={startAddress}
                onChange={(e) => setStartAddress(e.target.value)}
                placeholder="Enter start address"
                className="address-input-field"
              />
            </div>
            
            <div className="input-group">
              <label htmlFor="end-address">End Address:</label>
              <input
                id="end-address"
                type="text"
                value={endAddress}
                onChange={(e) => setEndAddress(e.target.value)}
                placeholder="Enter end address"
                className="address-input-field"
              />
            </div>

            <button 
              onClick={geocodeAndSetPoints}
              disabled={!startAddress.trim() || !endAddress.trim() || isGeocoding}
              className="geocode-btn"
            >
              {isGeocoding ? '🔄 Finding Addresses...' : '📍 Find Addresses'}
            </button>
          </div>
        )}

        {/* Route Planning */}
        {!isNavigating && startLocation && endLocation && (
          <div className="route-planning">
            <div className="mode-selector">
              <label htmlFor="routing-mode">Route Type:</label>
              <select 
                id="routing-mode" 
                value={selectedRouteType} 
                onChange={(e) => setSelectedRouteType(e.target.value)}
              >
                {routeTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="action-buttons">
              <button 
                onClick={generateRoute} 
                disabled={isLoading}
                className="generate-btn"
              >
                {isLoading ? '🔄 Generating Route...' : '🗺️ Generate Route'}
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
                <span className="value">{(currentRoute.distance_meters / 1000).toFixed(2)} km</span>
              </div>
              <div className="stat">
                <span className="label">Time:</span>
                <span className="value">{currentRoute.estimated_time_minutes.toFixed(1)} min</span>
              </div>
              <div className="stat">
                <span className="label">Safety:</span>
                <span className="value">{currentRoute.safety_score.toFixed(1)}/10</span>
              </div>
              <div className="stat">
                <span className="label">Bike Friendly:</span>
                <span className="value">{currentRoute.bike_coverage_percent.toFixed(0)}%</span>
              </div>
            </div>
            
            {!isNavigating && (
              <button onClick={startNavigation} className="navigate-btn">
                🚀 Start Navigation
              </button>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}
      </div>

      <style jsx>{`
        .real-navigation-container {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .real-navigation-controls {
          position: absolute;
          top: 20px;
          left: 20px;
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          min-width: 350px;
          z-index: 1000;
          backdrop-filter: blur(10px);
        }

        .nav-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #e5e7eb;
        }

        .nav-header h3 {
          margin: 0;
          color: #1f2937;
          font-size: 18px;
        }

        .nav-status {
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

        .address-input {
          margin-bottom: 15px;
        }

        .input-group {
          margin-bottom: 12px;
        }

        .input-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #374151;
          font-size: 14px;
        }

        .address-input-field {
          width: 100%;
          padding: 10px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          box-sizing: border-box;
        }

        .address-input-field:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .geocode-btn {
          width: 100%;
          background: #3b82f6;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .geocode-btn:hover:not(:disabled) {
          background: #2563eb;
        }

        .geocode-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .route-planning {
          margin-bottom: 15px;
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

        .error-message {
          background: #fef2f2;
          color: #dc2626;
          padding: 10px;
          border-radius: 6px;
          font-size: 14px;
          margin-top: 10px;
          border-left: 4px solid #dc2626;
        }
      `}</style>
    </div>
  );
};

export default RealNavigationMap;