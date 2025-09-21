'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Map, Marker, LngLatBounds } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

interface Location {
  name: string;
  coordinates: [number, number]; // [longitude, latitude] - MapTiler format
}

interface UnifiedMapProps {
  apiKey1: string;
  apiKey2: string;

  // Route display props (from RealTimeMap)
  route?: [number, number][]; // Array of [latitude, longitude] pairs from backend
  startLocation?: Location;
  endLocation?: Location;

  // Interactive props (from InteractiveMap)
  onLocationSelect?: (location: Location) => void;
  onRouteRequest?: (startLocation: Location, endLocation: Location) => void;
  showControls?: boolean;
  allowClickToSelect?: boolean;

  // Mode control
  mode?: 'interactive' | 'display' | 'hybrid'; // hybrid = both modes available
}

const UnifiedMap: React.FC<UnifiedMapProps> = ({
  apiKey1,
  apiKey2,
  route,
  startLocation,
  endLocation,
  onLocationSelect,
  onRouteRequest,
  showControls = true,
  allowClickToSelect = true,
  mode = 'hybrid'
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const mapInitializedRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);

  // Interactive state (from InteractiveMap)
  const [selectedStartLocation, setSelectedStartLocation] = useState<Location | null>(null);
  const [selectedEndLocation, setSelectedEndLocation] = useState<Location | null>(null);
  const [isSelectingStart, setIsSelectingStart] = useState(false);
  const [isSelectingEnd, setIsSelectingEnd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [userLocation, setUserLocation] = useState<Location | null>(null);

  // Default center coordinates
  const defaultCenter: [number, number] = [-86.9212, 40.4237];
  const defaultZoom = 14;

  // Determine if we should show interactive controls
  const shouldShowControls = showControls && (mode === 'interactive' || mode === 'hybrid');
  const shouldAllowClickSelect = allowClickToSelect && (mode === 'interactive' || mode === 'hybrid');
  const hasRouteToDisplay = route && route.length > 0 && (mode === 'display' || mode === 'hybrid');

  // Initialize map
  const initializeMap = useCallback(() => {
    if (mapInitializedRef.current || !mapContainer.current) {
      return;
    }

    const selectedApiKey = Math.random() < 0.5 ? apiKey1 : apiKey2;

    console.log('🗺️ Initializing UnifiedMap...');

    try {
      map.current = new Map({
        container: mapContainer.current,
        apiKey: selectedApiKey,
        center: defaultCenter,
        zoom: defaultZoom,
        style: 'https://api.maptiler.com/maps/streets-v2/style.json',
        attributionControl: false,
        navigationControl: true, // Enable navigation controls for testing
        interactive: true, // Ensure map is interactive
      });

      mapInitializedRef.current = true;

      // Map event handlers
      map.current.on('load', () => {
        console.log('✅ UnifiedMap loaded successfully');
        console.log('Map interactions enabled:', map.current?.isStyleLoaded());
        console.log('Map container:', mapContainer.current);
        setIsMapReady(true);
        map.current?.resize();
      });

      map.current.on('error', (e) => {
        console.error('❌ UnifiedMap error:', e);
      });

      // Add debugging event listeners
      map.current.on('mousedown', () => {
        console.log('🖱️ Map mousedown event');
      });

      map.current.on('mousemove', () => {
        console.log('🖱️ Map mousemove event');
      });

      map.current.on('wheel', () => {
        console.log('🖱️ Map wheel event');
      });

      // Map interactions are enabled by default with interactive: true
      // Additional interaction settings can be configured here if needed

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
            const userLoc: Location = {
              name: 'My Location',
              coordinates: [userLon, userLat] // MapTiler format
            };
            setUserLocation(userLoc);
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

      // Add click handler for location selection (only in interactive modes)
      if (shouldAllowClickSelect) {
        map.current.on('click', handleMapClick);
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
      console.error('❌ Failed to initialize UnifiedMap:', error);
    }
  }, [apiKey1, apiKey2, shouldAllowClickSelect]);

  // Initialize map on mount
  useEffect(() => {
    initializeMap();
  }, [initializeMap]);

  // Handle map click for location selection (InteractiveMap functionality)
  const handleMapClick = useCallback((e: any) => {
    if (!isMapReady || (!isSelectingStart && !isSelectingEnd)) return;

    const { lng, lat } = e.lngLat;
    const location: Location = {
      name: `Selected Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      coordinates: [lng, lat] // MapTiler format
    };

    if (isSelectingStart) {
      setSelectedStartLocation(location);
      setIsSelectingStart(false);
      addInteractiveMarkerToMap(location, 'start');
      if (onLocationSelect) {
        onLocationSelect(location);
      }
    } else if (isSelectingEnd) {
      setSelectedEndLocation(location);
      setIsSelectingEnd(false);
      addInteractiveMarkerToMap(location, 'end');
      if (onLocationSelect) {
        onLocationSelect(location);
      }
    }
  }, [isMapReady, isSelectingStart, isSelectingEnd, onLocationSelect]);

  // Add interactive marker to map (for user selections)
  const addInteractiveMarkerToMap = useCallback((location: Location, type: 'start' | 'end' | 'user') => {
    if (!map.current || !isMapReady) return;

    const color = type === 'start' ? '#22c55e' : type === 'end' ? '#ef4444' : '#3b82f6';
    const label = type === 'start' ? 'START' : type === 'end' ? 'END' : 'YOU';

    // Remove existing marker of same type
    const existingMarkers = map.current.getContainer().querySelectorAll(`.interactive-marker-${type}`);
    existingMarkers.forEach(marker => marker.remove());

    // Add new marker
    const marker = new Marker({ color })
      .setLngLat([location.coordinates[0], location.coordinates[1]]) // MapTiler format
      .setPopup(new (window as any).maptilersdk.Popup().setHTML(`
        <div>
          <strong>${label}:</strong><br/>
          ${location.name}
        </div>
      `))
      .addTo(map.current);

    // Add class for identification
    marker.getElement().classList.add(`interactive-marker-${type}`);
  }, [isMapReady]);

  // Search for locations (InteractiveMap functionality)
  const searchLocations = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const selectedApiKey = Math.random() < 0.5 ? apiKey1 : apiKey2;
      const response = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${selectedApiKey}&limit=5`
      );

      if (response.ok) {
        const data = await response.json();
        const locations: Location[] = data.features.map((feature: any) => ({
          name: feature.place_name,
          coordinates: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]] // MapTiler format
        }));
        setSearchResults(locations);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [apiKey1, apiKey2]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    searchLocations(query);
  };

  // Select location from search results
  const selectLocationFromSearch = (location: Location, type: 'start' | 'end') => {
    if (type === 'start') {
      setSelectedStartLocation(location);
      setIsSelectingStart(false);
    } else {
      setSelectedEndLocation(location);
      setIsSelectingEnd(false);
    }

    addInteractiveMarkerToMap(location, type);
    setSearchQuery('');
    setSearchResults([]);

    if (onLocationSelect) {
      onLocationSelect(location);
    }
  };

  // Start location selection mode
  const startLocationSelection = () => {
    setIsSelectingStart(true);
    setIsSelectingEnd(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // End location selection mode
  const endLocationSelection = () => {
    setIsSelectingEnd(true);
    setIsSelectingStart(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Use current location
  const useCurrentLocation = (type: 'start' | 'end') => {
    if (!userLocation) return;

    if (type === 'start') {
      setSelectedStartLocation(userLocation);
      setIsSelectingStart(false);
    } else {
      setSelectedEndLocation(userLocation);
      setIsSelectingEnd(false);
    }

    addInteractiveMarkerToMap(userLocation, type);

    if (onLocationSelect) {
      onLocationSelect(userLocation);
    }
  };

  // Generate route (InteractiveMap functionality)
  const generateRoute = () => {
    if (selectedStartLocation && selectedEndLocation && onRouteRequest) {
      onRouteRequest(selectedStartLocation, selectedEndLocation);
    }
  };

  // Clear selections
  const clearSelections = () => {
    setSelectedStartLocation(null);
    setSelectedEndLocation(null);
    setIsSelectingStart(false);
    setIsSelectingEnd(false);
    setSearchQuery('');
    setSearchResults([]);

    if (map.current && isMapReady) {
      // Remove interactive markers only
      const existingMarkers = map.current.getContainer().querySelectorAll('.interactive-marker-start, .interactive-marker-end');
      existingMarkers.forEach(marker => marker.remove());
    }
  };

  // Fit map to show both locations
  const fitToLocations = () => {
    if (selectedStartLocation && selectedEndLocation && map.current && isMapReady) {
      const bounds = new LngLatBounds(
        [selectedStartLocation.coordinates[0], selectedStartLocation.coordinates[1]], // MapTiler format
        [selectedEndLocation.coordinates[0], selectedEndLocation.coordinates[1]]
      );
      map.current.fitBounds(bounds, { padding: 50 });
    }
  };

  // Add route to map (RealTimeMap functionality)
  const addRouteToMap = useCallback(() => {
    if (!map.current || !isMapReady || !route || route.length === 0) {
      return;
    }

    console.log('🗺️ Adding route to map:', {
      routeLength: route.length,
      firstCoord: route[0],
      lastCoord: route[route.length - 1]
    });

    try {
      // Remove existing route layers and sources
      const layersToRemove = [
        'route', 'route-outline',
        'start-marker', 'start-marker-bg', 'start-marker-label',
        'end-marker', 'end-marker-bg', 'end-marker-label'
      ];
      const sourcesToRemove = ['route', 'start-marker', 'end-marker'];

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
      const routeCoordinates = route.map(coord => [coord[1], coord[0]]);

      console.log('📍 Converted coordinates:', {
        original: route[0],
        converted: routeCoordinates[0]
      });

      // Create route GeoJSON
      const routeGeoJSON = {
        type: 'Feature' as const,
        properties: {
          name: 'Route',
          description: 'Generated route from backend'
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: routeCoordinates
        },
      };

      // Add route source
      map.current.addSource('route', {
        type: 'geojson',
        data: routeGeoJSON,
      });

      // Add start marker
      map.current.addSource('start-marker', {
        type: 'geojson',
        data: {
          type: 'Feature' as const,
          properties: {
            type: 'start',
            name: startLocation?.name || 'Start'
          },
          geometry: {
            type: 'Point' as const,
            coordinates: actualStartCoords
          }
        }
      });

      // Add end marker
      map.current.addSource('end-marker', {
        type: 'geojson',
        data: {
          type: 'Feature' as const,
          properties: {
            type: 'end',
            name: endLocation?.name || 'End'
          },
          geometry: {
            type: 'Point' as const,
            coordinates: actualEndCoords
          }
        }
      });

      console.log('✅ Route line layers added');

      // Determine start and end coordinates
      let actualStartCoords: [number, number] = [0, 0]; // Initialize with a default value
      let actualEndCoords: [number, number] = [0, 0]; // Initialize with a default value

      // Use provided locations if available, otherwise use route endpoints
      if (startLocation?.coordinates &&
          startLocation.coordinates[0] !== 0 &&
          startLocation.coordinates[1] !== 0) {
        actualStartCoords = [startLocation.coordinates[0], startLocation.coordinates[1]]; // MapTiler format
        console.log('📍 Using actual start location:', startLocation.name);
      } else {
        actualStartCoords = routeCoordinates[0];
        console.log('📍 Using route start point');
      }

      if (endLocation?.coordinates &&
          endLocation.coordinates[0] !== 0 &&
          endLocation.coordinates[1] !== 0) {
        actualEndCoords = [endLocation.coordinates[0], endLocation.coordinates[1]]; // MapTiler format
        console.log('📍 Using actual end location:', endLocation.name);
      } else {
        actualEndCoords = routeCoordinates[routeCoordinates.length - 1];
        console.log('📍 Using route end point');
      }

      // Add start marker
      map.current.addSource('start-marker', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {
            type: 'start',
            name: startLocation?.name || 'Start'
          },
          geometry: {
            type: 'Point',
            coordinates: actualStartCoords
          }
        }
      });

      // Start marker background
      map.current.addLayer({
        id: 'start-marker-bg',
        type: 'circle',
        source: 'start-marker',
        paint: {
          'circle-radius': 14,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#10b981',
          'circle-opacity': 0.9
        }
      });

      // Start marker main circle
      map.current.addLayer({
        id: 'start-marker',
        type: 'circle',
        source: 'start-marker',
        paint: {
          'circle-radius': 10,
          'circle-color': '#10b981',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1
        }
      });

      // Start marker label
      map.current.addLayer({
        id: 'start-marker-label',
        type: 'symbol',
        source: 'start-marker',
        layout: {
          'text-field': 'START',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-offset': [0, -2.8],
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#10b981',
          'text-halo-width': 2,
          'text-opacity': 1
        }
      });

      // Add end marker
      map.current.addSource('end-marker', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {
            type: 'end',
            name: endLocation?.name || 'End'
          },
          geometry: {
            type: 'Point',
            coordinates: actualEndCoords
          }
        }
      });

      // End marker background
      map.current.addLayer({
        id: 'end-marker-bg',
        type: 'circle',
        source: 'end-marker',
        paint: {
          'circle-radius': 14,
          'circle-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ef4444',
          'circle-opacity': 0.9
        }
      });

      // End marker main circle
      map.current.addLayer({
        id: 'end-marker',
        type: 'circle',
        source: 'end-marker',
        paint: {
          'circle-radius': 10,
          'circle-color': '#ef4444',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1
        }
      });

      // End marker label
      map.current.addLayer({
        id: 'end-marker-label',
        type: 'symbol',
        source: 'end-marker',
        layout: {
          'text-field': 'END',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-offset': [0, -2.8],
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#ef4444',
          'text-halo-width': 2,
          'text-opacity': 1
        }
      });

      console.log('✅ Start and end markers added');

      // Fit map to route bounds
      const bounds = new LngLatBounds();
      routeCoordinates.forEach(coord => bounds.extend(coord as [number, number]));

      const boundsArray = bounds.toArray();
      console.log('🎯 Fitting map bounds to route:', {
        bounds: boundsArray,
        routePoints: routeCoordinates.length
      });

      // Calculate dynamic padding
      const routeWidth = boundsArray[2] - boundsArray[0];
      const routeHeight = boundsArray[3] - boundsArray[1];
      const basePadding = 80;
      const dynamicPadding = Math.max(basePadding, Math.min(routeWidth, routeHeight) * 0.1);

      // Fit bounds with padding
      try {
        map.current.fitBounds(bounds, {
          padding: {
            top: dynamicPadding,
            bottom: dynamicPadding,
            left: dynamicPadding,
            right: dynamicPadding
          },
          duration: 2000,
          maxZoom: 18,
          minZoom: 8
        });

        console.log('✅ Map bounds fitted to route');
      } catch (error) {
        console.warn('⚠️ Error fitting bounds, using fallback centering:', error);
        const midIndex = Math.floor(routeCoordinates.length / 2);
        const midCoord = routeCoordinates[midIndex];
        map.current.setCenter(midCoord as [number, number], 12);
      }

      // Ensure map is properly rendered
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
          console.log('✅ Map resized after route addition');
        }
      }, 100);

      console.log('✅ Route addition completed successfully');

    } catch (error) {
      console.error('❌ Error adding route to map:', error);
    }
  }, [isMapReady, route, startLocation, endLocation]);

  // Add route when map is ready and route data is available
  useEffect(() => {
    if (isMapReady && hasRouteToDisplay) {
      // Wait for style to be loaded
      if (map.current?.isStyleLoaded()) {
        addRouteToMap();
      } else {
        console.log('⏳ Waiting for map style to load...');
        const handleStyleLoad = () => {
          if (map.current?.isStyleLoaded()) {
            console.log('✅ Map style loaded, adding route...');
            addRouteToMap();
            map.current.off('styledata', handleStyleLoad);
          }
        };
        map.current.on('styledata', handleStyleLoad);

        // Fallback timeout
        setTimeout(() => {
          if (map.current && !map.current.isStyleLoaded()) {
            console.warn('⚠️ Style load timeout, attempting to add route anyway...');
            try {
              addRouteToMap();
            } catch (error) {
              console.error('❌ Failed to add route after timeout:', error);
            }
          }
        }, 5000);
      }
    }
  }, [isMapReady, hasRouteToDisplay, addRouteToMap]);

  return (
    <div className="unified-map-container">
      {/* Map */}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />


      <style jsx>{`
        .unified-map-container {
          position: relative;
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
};

export default UnifiedMap;
