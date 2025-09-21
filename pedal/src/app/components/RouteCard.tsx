'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

// Google Maps type declarations
declare global {
  interface Window {
    google: {
      maps: {
        places: {
          Autocomplete: any;
        };
        Geocoder: any;
        LatLng: any;
        LatLngBounds: any;
      };
    };
  }
}
import {
  Route,
  ShieldCheck,
  Zap,
  Navigation,
  Bike,
  Plus,
  X,
  MapPin,
} from 'lucide-react';
import '../../firebase'; // Ensure firebase is initialized
import { db, auth } from '../../firebase';
import { ref, onValue, push, update, increment, set, get } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { useDashboard } from '../dashboard/layout'; // Import dashboard context

interface Location {
  name: string;
  coordinates: [number, number]; // [longitude, latitude] - MapTiler format
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

interface RouteSegment {
  route: [number, number][];
  distance_meters: number;
  estimated_time_minutes: number;
  safety_score: number;
  bike_coverage_percent: number;
  start_location: Location;
  end_location: Location;
}

interface CombinedRouteData {
  segments: RouteSegment[];
  total_distance_meters: number;
  total_estimated_time_minutes: number;
  average_safety_score: number;
  average_bike_coverage_percent: number;
  combined_route: [number, number][];
  route_type: string;
  steps?: DirectionStep[];
}

interface DirectionStep {
  instruction: string;
  distance: string;
  duration: string;
  maneuver: string;
}

interface RouteCardProps {
  apiKey1: string;
  apiKey2: string;
  routeToLoad?: any;
  onRouteLoaded?: () => void;
}

const RouteCard: React.FC<RouteCardProps> = ({ apiKey1, apiKey2, routeToLoad, onRouteLoaded }) => {
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [endLocation, setEndLocation] = useState<Location | null>(null);
  const [stops, setStops] = useState<Location[]>([]);
  const [selectedRouteType, setSelectedRouteType] = useState('fastest');
  const [user, setUser] = useState<any>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [currentRoute, setCurrentRoute] = useState<RouteData | null>(null);
  const [combinedRoute, setCombinedRoute] = useState<CombinedRouteData | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isUsingGoogleDirections, setIsUsingGoogleDirections] = useState(false);
  
  // Use dashboard context to share route data with background map
  const { setCurrentRoute: setDashboardRoute } = useDashboard();

  const [startSuggestions, setStartSuggestions] = useState<Location[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<Location[]>([]);
  const [stopSuggestions, setStopSuggestions] = useState<Location[][]>([]);

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const stopInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Google Maps autocomplete refs
  const startAutocompleteRef = useRef<any>(null);
  const endAutocompleteRef = useRef<any>(null);
  const stopAutocompleteRefs = useRef<Array<any>>([]);
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // Load Google Maps API
  useEffect(() => {
    const loadGoogleMaps = () => {
      // Check if Google Maps is already loaded
      if ((window as any).google && (window as any).google.maps && (window as any).google.maps.places) {
        setIsGoogleMapsLoaded(true);
        return;
      }

      // Check if script is already being loaded
      if (document.querySelector('script[src*="maps.googleapis.com"]')) {
        // Wait for it to load
        const checkLoaded = setInterval(() => {
          if ((window as any).google && (window as any).google.maps && (window as any).google.maps.places) {
            setIsGoogleMapsLoaded(true);
            clearInterval(checkLoaded);
          }
        }, 100);
        return;
      }

      // Load the script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setIsGoogleMapsLoaded(true);
      };
      script.onerror = () => {
        console.error('Failed to load Google Maps API');
      };
      document.head.appendChild(script);
    };

    loadGoogleMaps();
  }, []);

  // Handle loading a saved route into the form
  useEffect(() => {
    if (routeToLoad) {
      // Load the route data into the form fields
      setStartLocation(routeToLoad.start);
      setEndLocation(routeToLoad.end);
      setStops(routeToLoad.stops || []);
      setSelectedRouteType(routeToLoad.type || 'fastest');
      
      // If there's existing route data, load it
      if (routeToLoad.routeData) {
        if (routeToLoad.isMultiStop && routeToLoad.routeData.segments) {
          setCombinedRoute(routeToLoad.routeData);
        } else {
          setCurrentRoute(routeToLoad.routeData);
        }
      }
      
      // Clear the route to load and notify parent
      if (onRouteLoaded) {
        onRouteLoaded();
      }
    }
  }, [routeToLoad, onRouteLoaded]);

  // Get user's current location for proximity-based autocomplete
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.longitude, position.coords.latitude]);
        },
        (error) => {
          console.warn('Could not get user location:', error.message);
          // Fallback to a default location (e.g., Indianapolis) if geolocation fails
          setUserLocation([-86.1581, 39.7684]);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    } else {
      console.warn('Geolocation is not supported by this browser');
      // Fallback to a default location
      setUserLocation([-86.1581, 39.7684]);
    }
  }, []);

  // Initialize Google Maps autocomplete when API is loaded
  useEffect(() => {
    if (isGoogleMapsLoaded && startInputRef.current && endInputRef.current) {
      // Initialize start location autocomplete
      startAutocompleteRef.current = new (window as any).google.maps.places.Autocomplete(startInputRef.current, {
        types: ['geocode'],
        componentRestrictions: { country: 'us' }
      });

      // Initialize end location autocomplete
      endAutocompleteRef.current = new (window as any).google.maps.places.Autocomplete(endInputRef.current, {
        types: ['geocode'],
        componentRestrictions: { country: 'us' }
      });

      // Set up bias to user location if available
      if (userLocation) {
        const bounds = new (window as any).google.maps.LatLngBounds(
          new (window as any).google.maps.LatLng(userLocation[1] - 0.1, userLocation[0] - 0.1), // SW
          new (window as any).google.maps.LatLng(userLocation[1] + 0.1, userLocation[0] + 0.1)  // NE
        );
        startAutocompleteRef.current.setBounds(bounds);
        endAutocompleteRef.current.setBounds(bounds);
      }

      // Add place_changed listeners
      startAutocompleteRef.current.addListener('place_changed', () => {
        const place = startAutocompleteRef.current?.getPlace();
        if (place && place.geometry && place.geometry.location) {
          const location: Location = {
            name: place.formatted_address || place.name || '',
            coordinates: [place.geometry.location.lng(), place.geometry.location.lat()]
          };
          setStartLocation(location);
          setStartSuggestions([]); // Clear MapTiler suggestions
        }
      });

      endAutocompleteRef.current.addListener('place_changed', () => {
        const place = endAutocompleteRef.current?.getPlace();
        if (place && place.geometry && place.geometry.location) {
          const location: Location = {
            name: place.formatted_address || place.name || '',
            coordinates: [place.geometry.location.lng(), place.geometry.location.lat()]
          };
          setEndLocation(location);
          setEndSuggestions([]); // Clear MapTiler suggestions
        }
      });
    }
  }, [isGoogleMapsLoaded, userLocation]);

  // Initialize Google Maps autocomplete for stops when they are added
  useEffect(() => {
    if (isGoogleMapsLoaded && stops.length > 0) {
      // Initialize autocomplete for any new stops that don't have it yet
      stops.forEach((_, index) => {
        const inputElement = stopInputRefs.current[index];
        if (inputElement && !stopAutocompleteRefs.current[index]) {
          const autocomplete = new (window as any).google.maps.places.Autocomplete(inputElement, {
            types: ['geocode'],
            componentRestrictions: { country: 'us' }
          });

          // Set up bias to user location if available
          if (userLocation) {
            const bounds = new (window as any).google.maps.LatLngBounds(
              new (window as any).google.maps.LatLng(userLocation[1] - 0.1, userLocation[0] - 0.1), // SW
              new (window as any).google.maps.LatLng(userLocation[1] + 0.1, userLocation[0] + 0.1)  // NE
            );
            autocomplete.setBounds(bounds);
          }

          // Add place_changed listener
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place && place.geometry && place.geometry.location) {
              const location: Location = {
                name: place.formatted_address || place.name || '',
                coordinates: [place.geometry.location.lng(), place.geometry.location.lat()]
              };
              
              const newStops = [...stops];
              newStops[index] = location;
              setStops(newStops);
              
              // Clear MapTiler suggestions for this stop
              const newStopSuggestions = [...stopSuggestions];
              newStopSuggestions[index] = [];
              setStopSuggestions(newStopSuggestions);
            }
          });

          stopAutocompleteRefs.current[index] = autocomplete;
        }
      });
    }
  }, [isGoogleMapsLoaded, stops.length, userLocation]);

  // Add "Use Current Location" functionality
  const useCurrentLocation = (type: 'start' | 'end') => {
    if (!userLocation) {
      alert('Current location not available. Please enable location services.');
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Reverse geocode to get address
          let locationName = `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
          
          if (isGoogleMapsLoaded) {
            const geocoder = new (window as any).google.maps.Geocoder();
            try {
              const response = await geocoder.geocode({
                location: { lat: latitude, lng: longitude }
              });
              if (response.results && response.results.length > 0) {
                locationName = response.results[0].formatted_address;
              }
            } catch (error) {
              console.warn('Reverse geocoding failed:', error);
            }
          }

          const location: Location = {
            name: locationName,
            coordinates: [longitude, latitude]
          };

          if (type === 'start') {
            setStartLocation(location);
            if (startInputRef.current) {
              startInputRef.current.value = locationName;
            }
          } else {
            setEndLocation(location);
            if (endInputRef.current) {
              endInputRef.current.value = locationName;
            }
          }
        },
        (error) => {
          console.error('Error getting current location:', error);
          alert('Unable to get current location. Please check your location settings.');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    }
  };

  const geocodeAddress = useCallback(async (address: string): Promise<[number, number] | null> => {
    if (!address) return null;
    try {
      const selectedApiKey = Math.random() < 0.5 ? apiKey1 : apiKey2;
      const apiUrl = `https://api.maptiler.com/geocoding/${encodeURIComponent(address)}.json?limit=1&key=${selectedApiKey}`;
      
      console.log('🌍 Geocoding address:', {
        address: address,
        apiUrl: apiUrl
      });
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      console.log('📍 Geocoding response:', {
        address: address,
        featuresCount: data.features?.length || 0,
        firstFeature: data.features?.[0]
      });
      
      if (data.features && data.features.length > 0) {
        const coordinates = data.features[0].center; // [longitude, latitude]
        console.log('✅ Geocoding successful:', {
          address: address,
          coordinates: coordinates,
          placeName: data.features[0].place_name
        });
        return coordinates;
      }
      
      console.warn('⚠️ No geocoding results for:', address);
      return null;
    } catch (error) {
      console.error('❌ Error geocoding address:', {
        address: address,
        error: error
      });
      return null;
    }
  }, [apiKey1, apiKey2]);

  const fetchSuggestions = useCallback(async (query: string, setter: React.Dispatch<React.SetStateAction<Location[]>>) => {
    if (!query) {
      setter([]);
      return;
    }
    try {
      const selectedApiKey = Math.random() < 0.5 ? apiKey1 : apiKey2;
      
      // Build the API URL with proximity bias if user location is available
      let apiUrl = `https://api.maptiler.com/geocoding/${query}.json?autocomplete=true&limit=5&key=${selectedApiKey}`;
      
      if (userLocation) {
        // Add proximity bias to prioritize results closer to user's location
        apiUrl += `&proximity=${userLocation[0]},${userLocation[1]}`;
      }
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      const newSuggestions: Location[] = data.features.map((feature: any) => ({
        name: feature.place_name,
        coordinates: feature.center,
      }));
      setter(newSuggestions);
    } catch (error) {
      console.error('Error fetching geocoding suggestions:', error);
      setter([]);
    }
  }, [apiKey1, apiKey2, userLocation]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setLocation: React.Dispatch<React.SetStateAction<Location | null>>,
    setSuggestions: React.Dispatch<React.SetStateAction<Location[]>>,
    currentLocation: Location | null // Pass the current state value
  ) => {
    const value = e.target.value;
    
    // Update the location name as the user types
    setLocation(prev => ({
      ...prev,
      name: value,
      coordinates: prev?.coordinates || [0, 0] // Keep existing coordinates or default
    }));

    // Only fetch MapTiler suggestions if Google Maps autocomplete is not available
    if (!isGoogleMapsLoaded) {
      fetchSuggestions(value, setSuggestions);
    }
  };

  // Google Directions API integration
  const generateGoogleDirections = async (): Promise<CombinedRouteData | null> => {
    if (!isGoogleMapsLoaded || !startLocation || !endLocation) {
      return null;
    }

    return new Promise((resolve) => {
      const directionsService = new (window as any).google.maps.DirectionsService();
      
      // Prepare waypoints from stops
      const waypoints = stops
        .filter(stop => stop.name && stop.coordinates[0] !== 0 && stop.coordinates[1] !== 0)
        .map(stop => ({
          location: new (window as any).google.maps.LatLng(stop.coordinates[1], stop.coordinates[0]),
          stopover: true
        }));

      const request = {
        origin: new (window as any).google.maps.LatLng(startLocation.coordinates[1], startLocation.coordinates[0]),
        destination: new (window as any).google.maps.LatLng(endLocation.coordinates[1], endLocation.coordinates[0]),
        waypoints: waypoints,
        travelMode: (window as any).google.maps.TravelMode.BICYCLING,
        unitSystem: (window as any).google.maps.UnitSystem.METRIC,
        avoidHighways: false,
        avoidTolls: true
      };

      directionsService.route(request, (result: any, status: any) => {
        if (status === (window as any).google.maps.DirectionsStatus.OK && result) {
          // Convert Google Directions to our format
          const route = result.routes[0];
          const legs = route.legs;
          
          let combinedRoute: [number, number][] = [];
          let totalDistance = 0;
          let totalTime = 0;
          const steps: DirectionStep[] = [];

          // Process each leg of the journey
          legs.forEach((leg: any) => {
            totalDistance += leg.distance.value;
            totalTime += leg.duration.value;

            // Extract route coordinates from leg
            leg.steps.forEach((step: any) => {
              // Get the polyline path from the step
              if (step.polyline && step.polyline.getPath) {
                const path = step.polyline.getPath();
                path.forEach((point: any) => {
                  combinedRoute.push([point.lat(), point.lng()]);
                });
              } else if (step.start_location && step.end_location) {
                // Fallback: just add start and end points
                combinedRoute.push([step.start_location.lat(), step.start_location.lng()]);
                combinedRoute.push([step.end_location.lat(), step.end_location.lng()]);
              }

              // Add turn-by-turn instructions
              steps.push({
                instruction: step.instructions.replace(/<[^>]*>/g, ''), // Remove HTML tags
                distance: step.distance.text,
                duration: step.duration.text,
                maneuver: step.maneuver || 'straight'
              });
            });
          });

          const combinedData: CombinedRouteData = {
            segments: [], // We'll populate this if needed
            total_distance_meters: totalDistance,
            total_estimated_time_minutes: totalTime / 60,
            average_safety_score: 7.5, // Default for Google routes
            average_bike_coverage_percent: 80, // Assume good bike coverage for Google bike routes
            combined_route: combinedRoute,
            route_type: 'google_directions',
            steps: steps
          };

          resolve(combinedData);
        } else {
          console.error('Google Directions request failed:', status);
          resolve(null);
        }
      });
    });
  };

  // Backend API route generation with multiple stops
  const generateBackendRoute = async (): Promise<CombinedRouteData | null> => {
    // Create route segments: start -> stop1 -> stop2 -> ... -> end
    const waypoints = [startLocation!, ...stops.filter(stop => stop.name && stop.coordinates[0] !== 0), endLocation!];
    const segments: RouteSegment[] = [];
    let combinedRoute: [number, number][] = [];
    let totalDistance = 0;
    let totalTime = 0;
    let totalSafety = 0;
    let totalBikeCoverage = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const segmentStart = waypoints[i];
      const segmentEnd = waypoints[i + 1];

      try {
        // Geocode if needed
        let finalStart = segmentStart;
        let finalEnd = segmentEnd;

        if (!finalStart.coordinates || (finalStart.coordinates[0] === 0 && finalStart.coordinates[1] === 0)) {
          const coords = await geocodeAddress(finalStart.name);
          if (coords) {
            finalStart = { ...finalStart, coordinates: coords };
          } else {
            throw new Error(`Could not geocode: ${finalStart.name}`);
          }
        }

        if (!finalEnd.coordinates || (finalEnd.coordinates[0] === 0 && finalEnd.coordinates[1] === 0)) {
          const coords = await geocodeAddress(finalEnd.name);
          if (coords) {
            finalEnd = { ...finalEnd, coordinates: coords };
          } else {
            throw new Error(`Could not geocode: ${finalEnd.name}`);
          }
        }

        const requestPayload = {
          start_lat: finalStart.coordinates[1],
          start_lon: finalStart.coordinates[0],
          end_lat: finalEnd.coordinates[1],
          end_lon: finalEnd.coordinates[0],
          route_type: selectedRouteType,
          algorithm: "dijkstra",
        };

        console.log(`🚀 Fetching route segment ${i + 1}/${waypoints.length - 1}:`, {
          from: finalStart.name,
          to: finalEnd.name
        });

        const response = await fetch('http://localhost:8000/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to fetch route segment');
        }

        const segmentData: RouteData = await response.json();

        if (segmentData.error_message) {
          throw new Error(segmentData.error_message);
        }

        const segment: RouteSegment = {
          route: segmentData.route,
          distance_meters: segmentData.distance_meters,
          estimated_time_minutes: segmentData.estimated_time_minutes,
          safety_score: segmentData.safety_score,
          bike_coverage_percent: segmentData.bike_coverage_percent,
          start_location: finalStart,
          end_location: finalEnd
        };

        segments.push(segment);
        combinedRoute = combinedRoute.concat(segmentData.route);
        totalDistance += segmentData.distance_meters;
        totalTime += segmentData.estimated_time_minutes;
        totalSafety += segmentData.safety_score;
        totalBikeCoverage += segmentData.bike_coverage_percent;

      } catch (error: any) {
        console.error(`Error generating route segment ${i + 1}:`, error);
        throw error;
      }
    }

    return {
      segments,
      total_distance_meters: totalDistance,
      total_estimated_time_minutes: totalTime,
      average_safety_score: totalSafety / segments.length,
      average_bike_coverage_percent: totalBikeCoverage / segments.length,
      combined_route: combinedRoute,
      route_type: selectedRouteType
    };
  };

  const generateRoute = async () => {
    if (!startLocation?.name || !endLocation?.name) {
      alert('Please enter both a starting point and a destination.');
      return;
    }

    console.log('🚀 Starting route generation:', {
      startLocation: startLocation,
      endLocation: endLocation,
      stops: stops,
      selectedRouteType: selectedRouteType,
      hasStops: stops.length > 0
    });

    setIsLoadingRoute(true);
    setRouteError(null);
    setCurrentRoute(null);
    setCombinedRoute(null);

    try {
      let combinedRouteData: CombinedRouteData | null = null;

      // Use Google Directions only if there are multiple stops (complex multi-stop routing)
      if (stops.length > 0) {
        console.log('🗺️ Using Google Directions API for multi-stop routing...');
        setIsUsingGoogleDirections(true);
        combinedRouteData = await generateGoogleDirections();
        
        if (!combinedRouteData) {
          // Fallback to backend API for multiple stops
          console.log('⚠️ Google Directions failed, falling back to backend API...');
          combinedRouteData = await generateBackendRoute();
          setIsUsingGoogleDirections(false);
        }
      } else {
        // Use backend API for all single-destination routes (fastest, safe, bike, safe_bike)
        console.log(`🔧 Using backend API for ${selectedRouteType} routing...`);
        setIsUsingGoogleDirections(false);
        combinedRouteData = await generateBackendRoute();
      }

      if (!combinedRouteData) {
        throw new Error('Failed to generate route with all available methods.');
      }

      console.log('✅ Combined route data generated:', {
        totalDistance: combinedRouteData.total_distance_meters,
        totalTime: combinedRouteData.total_estimated_time_minutes,
        averageSafety: combinedRouteData.average_safety_score,
        averageBikeCoverage: combinedRouteData.average_bike_coverage_percent,
        routeType: combinedRouteData.route_type,
        segmentCount: combinedRouteData.segments.length,
        stepCount: combinedRouteData.steps?.length || 0
      });

      setCombinedRoute(combinedRouteData);

      // Send route data to background map
      setDashboardRoute({
        route: combinedRouteData.combined_route,
        startLocation: startLocation,
        endLocation: endLocation,
        distance_meters: combinedRouteData.total_distance_meters,
        estimated_time_minutes: combinedRouteData.total_estimated_time_minutes,
        safety_score: combinedRouteData.average_safety_score,
        bike_coverage_percent: combinedRouteData.average_bike_coverage_percent,
        route_type: combinedRouteData.route_type
      });

    } catch (error: any) {
      console.error('Error generating route:', error);
      setRouteError(error.message || 'An unexpected error occurred.');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleSelectSuggestion = (
    location: Location,
    setLocation: React.Dispatch<React.SetStateAction<Location | null>>,
    setSuggestions: React.Dispatch<React.SetStateAction<Location[]>>,
    inputRef: React.RefObject<HTMLInputElement | null>,
    index?: number // For stops
  ) => {
    setLocation(location);
    if (inputRef.current) {
      inputRef.current.value = location.name;
    }
    setSuggestions([]);
    if (index !== undefined) {
      const newStopSuggestions = [...stopSuggestions];
      newStopSuggestions[index] = [];
      setStopSuggestions(newStopSuggestions);
    }
  };

  const addStop = () => {
    setStops([...stops, { name: '', coordinates: [0, 0] }]);
    setStopSuggestions([...stopSuggestions, []]);
  };

  const removeStop = (index: number) => {
    const newStops = stops.filter((_, i) => i !== index);
    setStops(newStops);
    const newStopSuggestions = stopSuggestions.filter((_, i) => i !== index);
    setStopSuggestions(newStopSuggestions);
    stopInputRefs.current = stopInputRefs.current.filter((_, i) => i !== index);
    
    // Clean up Google autocomplete refs
    stopAutocompleteRefs.current = stopAutocompleteRefs.current.filter((_, i) => i !== index);
  };

  const handleStopInputChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = e.target.value;
    const newStops = [...stops];
    newStops[index] = { ...newStops[index], name: value };
    setStops(newStops);

    // Only fetch MapTiler suggestions if Google Maps autocomplete is not available
    if (!isGoogleMapsLoaded) {
      fetchSuggestions(value, (suggestions) => {
        setStopSuggestions(prev => {
          const newStopSuggestions = [...prev];
          newStopSuggestions[index] = Array.isArray(suggestions) ? suggestions : [];
          return newStopSuggestions;
        });
      });
    }
  };

  const handleStopSelectSuggestion = (location: Location, index: number) => {
    const newStops = [...stops];
    newStops[index] = location;
    setStops(newStops);
    if (stopInputRefs.current[index]) {
      stopInputRefs.current[index]!.value = location.name;
    }
    const newStopSuggestions = [...stopSuggestions];
    newStopSuggestions[index] = [];
    setStopSuggestions(newStopSuggestions);
  };

  // The handleRouteGenerated is no longer needed as generateRoute directly sets currentRoute
  // const handleRouteGenerated = (route: any) => {
  //   setCurrentRoute(route);
  //   setShowMap(true);
  // };

  const saveRoute = async () => {
    if (!startLocation || !endLocation || (!currentRoute && !combinedRoute)) {
      alert('Please generate a route first');
      return;
    }
    if (!user) {
      alert('Please log in to save routes and track CO2 savings.');
      return;
    }

    const routeToSave = combinedRoute || currentRoute;
    const distance = combinedRoute ? combinedRoute.total_distance_meters : currentRoute!.distance_meters;

    const route = {
      start: startLocation,
      end: endLocation,
      stops: stops.filter(stop => stop.name && stop.coordinates[0] !== 0), // Filter out empty stops
      type: selectedRouteType,
      timestamp: Date.now(),
      routeData: routeToSave,
      isMultiStop: stops.length > 0,
      usedGoogleDirections: isUsingGoogleDirections
    };

    // Save route to user profile
    const routeRef = push(ref(db, `users/${user.uid}/savedRoutes`));
    set(routeRef, route);

    // Estimate CO2 saved based on distance
    const co2Increment = (distance / 1000) * 0.2; // 0.2kg CO2 per km
    update(ref(db, `users/${user.uid}`), { co2Saved: increment(co2Increment) });

    alert(`${selectedRouteType.charAt(0).toUpperCase() + selectedRouteType.slice(1)} route saved! CO2 saved: ${co2Increment.toFixed(2)}kg`);
  };

  const clearRoute = () => {
    setCurrentRoute(null);
    setCombinedRoute(null);
    setRouteError(null);
    setIsUsingGoogleDirections(false);
    setDashboardRoute(null); // Clear route from background map
  };

  return (
    <div className="route-maker">
      <h2>
        <Route />
        Route Planner
      </h2>

      <div className="route-input-group">
        <label htmlFor="startLocation">Starting Point</label>
        <div className="input-container">
          <input
            type="text"
            id="startLocation"
            className="route-input"
            placeholder="Enter starting location"
            value={startLocation?.name || ''}
            onChange={(e) => handleInputChange(e, setStartLocation, setStartSuggestions, startLocation)}
            ref={startInputRef}
          />
          <button 
            type="button"
            className="current-location-btn"
            onClick={() => useCurrentLocation('start')}
            title="Use current location"
          >
            <MapPin size={16} />
          </button>
        </div>
        {!isGoogleMapsLoaded && startSuggestions.length > 0 && (
          <ul className="suggestions-list">
            {startSuggestions.map((loc, index) => (
              <li key={`start-${index}-${loc.coordinates[0]}-${loc.coordinates[1]}`} onClick={() => handleSelectSuggestion(loc, setStartLocation, setStartSuggestions, startInputRef)}>
                {loc.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {stops.map((stop, index) => (
        <div className="route-input-group" key={index}>
          <label htmlFor={`stopLocation-${index}`}>
            <div className="stop-label-container">
              <div className="stop-number-circle">{index + 1}</div>
              <span>Stop {index + 1}</span>
            </div>
          </label>
          <div className="input-container">
            <input
              type="text"
              id={`stopLocation-${index}`}
              className="route-input"
              placeholder="Enter stop location"
              onChange={(e) => handleStopInputChange(e, index)}
              ref={(el: HTMLInputElement | null) => {
                stopInputRefs.current[index] = el;
              }}
              value={stop?.name || ''}
            />
            <button className="remove-stop-btn" onClick={() => removeStop(index)}>
              <X size={16} />
            </button>
          </div>
          {!isGoogleMapsLoaded && stopSuggestions[index] && stopSuggestions[index].length > 0 && (
            <ul className="suggestions-list">
              {stopSuggestions[index].map((loc, idx) => (
                <li key={`stop-${index}-${idx}-${loc.coordinates[0]}-${loc.coordinates[1]}`} onClick={() => handleStopSelectSuggestion(loc, index)}>
                  {loc.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <button className="add-stop-btn" onClick={addStop}>
        <Plus size={16} /> Add Stop
      </button>

      <div className="route-input-group">
        <label htmlFor="endLocation">Destination</label>
        <div className="input-container">
          <input
            type="text"
            id="endLocation"
            className="route-input"
            placeholder="Enter destination"
            value={endLocation?.name || ''}
            onChange={(e) => handleInputChange(e, setEndLocation, setEndSuggestions, endLocation)}
            ref={endInputRef}
          />
          <button 
            type="button"
            className="current-location-btn"
            onClick={() => useCurrentLocation('end')}
            title="Use current location"
          >
            <MapPin size={16} />
          </button>
        </div>
        {!isGoogleMapsLoaded && endSuggestions.length > 0 && (
          <ul className="suggestions-list">
            {endSuggestions.map((loc, index) => (
              <li key={`end-${index}-${loc.coordinates[0]}-${loc.coordinates[1]}`} onClick={() => handleSelectSuggestion(loc, setEndLocation, setEndSuggestions, endInputRef)}>
                {loc.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="route-options">
        <div
          className={`route-option ${selectedRouteType === 'fastest' ? 'active' : ''}`}
          onClick={() => setSelectedRouteType('fastest')}
        >
          <Zap />
          <div>Fastest</div>
        </div>
        <div
          className={`route-option ${selectedRouteType === 'safe' ? 'active' : ''}`}
          onClick={() => setSelectedRouteType('safe')}
        >
          <ShieldCheck />
          <div>Safe</div>
        </div>
        <div
          className={`route-option ${selectedRouteType === 'bike' ? 'active' : ''}`}
          onClick={() => setSelectedRouteType('bike')}
        >
          <Bike />
          <div>Bike Routes</div>
        </div>
        <div
          className={`route-option ${selectedRouteType === 'safe_bike' ? 'active' : ''}`}
          onClick={() => setSelectedRouteType('safe_bike')}
        >
          <Bike />
          <div>Bike + Safe</div>
        </div>
      </div>

      <button className="route-btn" onClick={generateRoute} disabled={isLoadingRoute || !startLocation || !endLocation}>
        <Navigation />
        {isLoadingRoute ? 'Generating Route...' : 'Generate Route'}
      </button>

      {routeError && <div className="route-error-message">{routeError}</div>}

      {(currentRoute || combinedRoute) && (
        <div className="route-details-container">
          <div className="route-details">
            <p><strong>Route Generated Successfully!</strong></p>
            {combinedRoute ? (
              <>
                <p><span>Total Distance:</span> <span>{(combinedRoute.total_distance_meters / 1000).toFixed(2)} km</span></p>
                <p><span>Total Time:</span> <span>{combinedRoute.total_estimated_time_minutes.toFixed(0)} minutes</span></p>
                <p><span>Route Type:</span> <span>{combinedRoute.route_type.replace('_', ' ').toUpperCase()}</span></p>
                {stops.length > 0 && (
                  <p><span>Stops:</span> <span>{stops.length} intermediate stop{stops.length > 1 ? 's' : ''}</span></p>
                )}
                {isUsingGoogleDirections && (
                  <p><span>Navigation:</span> <span>Google Directions</span></p>
                )}
              </>
            ) : (
              <>
                <p><span>Distance:</span> <span>{currentRoute?.distance_meters !== undefined ? (currentRoute.distance_meters / 1000).toFixed(2) : 'N/A'} km</span></p>
                <p><span>Estimated Time:</span> <span>{currentRoute?.estimated_time_minutes !== undefined ? currentRoute.estimated_time_minutes.toFixed(0) : 'N/A'} minutes</span></p>
                <p><span>Route Type:</span> <span>{currentRoute?.route_type ? currentRoute.route_type.replace('_', ' ').toUpperCase() : 'N/A'}</span></p>
              </>
            )}
          </div>

          {/* Turn-by-turn directions */}
          {combinedRoute?.steps && combinedRoute.steps.length > 0 && (
            <div className="turn-by-turn-directions">
              <h3>
                <Navigation />
                Turn-by-turn Directions
              </h3>
              <div className="directions-list">
                {combinedRoute.steps.map((step, index) => (
                  <div key={index} className="direction-step">
                    <div className="step-number">{index + 1}</div>
                    <div className="step-content">
                      <div className="step-instruction">{step.instruction}</div>
                      <div className="step-details">
                        <span className="step-distance">{step.distance}</span>
                        <span className="step-duration">({step.duration})</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="route-actions">
            <button className="save-route-btn" onClick={saveRoute}>
              <Navigation />
              Save Route
            </button>
            <button className="clear-route-btn" onClick={clearRoute}>
              <X />
              Clear Route
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RouteCard;
