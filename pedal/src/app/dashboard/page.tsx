'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
import {
    Route,
    ShieldCheck,
    Navigation,
    AlertTriangle,
    X,
    ShieldAlert,
    Send,
    ThumbsUp,
    ThumbsDown,
    Menu,
    Bike,
    MapPin,
} from 'lucide-react';
import './dashboard.css';
import { db, auth } from '@/firebase';
import { ref, onValue, push, update, increment, set, get, remove } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import BottomNavBar from '../components/BottomNavBar';
import RouteCard from '../components/RouteCard'; // Import the new RouteCard component
import SavedRoutesPopup from '../components/SavedRoutesPopup'; // Import the new SavedRoutesPopup component

export default function DashboardPage() {
    const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
    const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const [currentTab, setCurrentTab] = useState('report');
    const [selectedRouteType, setSelectedRouteType] = useState('fastest'); // Re-add selectedRouteType
    const [user, setUser] = useState<any>(null);
    const [reports, setReports] = useState<any[]>([]);
    const [co2Saved, setCo2Saved] = useState<number>(0);
    const [savedRoutes, setSavedRoutes] = useState<any[]>([]);
    const [userVotes, setUserVotes] = useState<{ [reportId: string]: string }>({});
    const [isSavedRoutesPopupOpen, setIsSavedRoutesPopupOpen] = useState(false); // State for popup
    const [routeToLoad, setRouteToLoad] = useState<any>(null); // State for route to load into form
    const router = useRouter(); // Initialize useRouter

    // Google Maps autocomplete for crime location
    const crimeLocationInputRef = useRef<HTMLInputElement>(null);
    const crimeLocationAutocompleteRef = useRef<any>(null);
    const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

    const toggleRightSidebar = () => {
        setRightSidebarOpen(!rightSidebarOpen);
    };

    const toggleLeftSidebar = () => {
        setLeftSidebarOpen(!leftSidebarOpen);
    };

    const switchTab = (tabName: string) => {
        setCurrentTab(tabName);
    };


    const selectRouteType = (type: string) => { // Re-add selectRouteType
        setSelectedRouteType(type);
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                router.push('/login'); // Redirect to login page if not authenticated
            } else {
                // Fetch user CO2 saved
                onValue(ref(db, `users/${firebaseUser.uid}/co2Saved`), (snapshot) => {
                    setCo2Saved(snapshot.val() || 0);
                });
                // Fetch user saved routes
                onValue(ref(db, `users/${firebaseUser.uid}/savedRoutes`), (snapshot) => {
                    const val = snapshot.val();
                    if (val) {
                        // Add the Firebase key as id to each route
                        const routesWithIds = Object.entries(val).map(([id, data]) => ({ id, ...(data as object) }));
                        setSavedRoutes(routesWithIds);
                    } else {
                        setSavedRoutes([]);
                    }
                });
                // Listen for user votes on all reports
                onValue(ref(db, 'reports'), (snapshot) => {
                    const val = snapshot.val();
                    const reportsList = val ? Object.entries(val).map(([id, data]) => ({ id, ...(data as object) })) : [];
                    setReports(reportsList);
                    console.log('Reports loaded:', reportsList.length, reportsList);
                    if (val) {
                        const votes: { [reportId: string]: string } = {};
                        Object.entries(val).forEach(([id, data]: any) => {
                            if (data.votes && data.votes[firebaseUser.uid]) {
                                votes[id] = data.votes[firebaseUser.uid];
                            }
                        });
                        setUserVotes(votes);
                    } else {
                        setUserVotes({});
                    }
                });
            }
        });
        // Fetch all reports
        onValue(ref(db, 'reports'), (snapshot) => {
            const val = snapshot.val();
            const reportsList = val ? Object.entries(val).map(([id, data]) => ({ id, ...(data as object) })) : [];
            setReports(reportsList);
            console.log('All reports loaded:', reportsList.length, reportsList);
        });
        const handleResize = () => {
            if (window.innerWidth > 768) {
                setLeftSidebarOpen(true);
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            unsubscribe();
            window.removeEventListener('resize', handleResize);
        };
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

    // Get user's current location for proximity-based autocomplete
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserLocation([position.coords.longitude, position.coords.latitude]);
                },
                (error) => {
                    console.warn('Could not get user location:', error.message);
                    // Fallback to a default location (e.g., Indianapolis)
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

    // Initialize Google Maps autocomplete for crime location when API is loaded
    useEffect(() => {
        if (isGoogleMapsLoaded && crimeLocationInputRef.current) {
            // Initialize crime location autocomplete
            crimeLocationAutocompleteRef.current = new (window as any).google.maps.places.Autocomplete(crimeLocationInputRef.current, {
                types: ['geocode'],
                componentRestrictions: { country: 'us' }
            });

            // Set up bias to user location if available
            if (userLocation) {
                const bounds = new (window as any).google.maps.LatLngBounds(
                    new (window as any).google.maps.LatLng(userLocation[1] - 0.1, userLocation[0] - 0.1), // SW
                    new (window as any).google.maps.LatLng(userLocation[1] + 0.1, userLocation[0] + 0.1)  // NE
                );
                crimeLocationAutocompleteRef.current.setBounds(bounds);
            }

            // Add place_changed listener
            crimeLocationAutocompleteRef.current.addListener('place_changed', () => {
                const place = crimeLocationAutocompleteRef.current?.getPlace();
                if (place && place.geometry && place.geometry.location) {
                    const locationName = place.formatted_address || place.name || '';
                    if (crimeLocationInputRef.current) {
                        crimeLocationInputRef.current.value = locationName;
                    }
                }
            });
        }
    }, [isGoogleMapsLoaded, userLocation]);

    // Add "Use Current Location" functionality for crime location
    const useCurrentLocationForCrime = () => {
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

                    if (crimeLocationInputRef.current) {
                        crimeLocationInputRef.current.value = locationName;
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

    const submitReport = () => {
        const crimeType = (document.getElementById('crimeType') as HTMLSelectElement).value;
        const crimeLocation = (document.getElementById('crimeLocation') as HTMLInputElement).value;
        const crimeDescription = (document.getElementById('crimeDescription') as HTMLTextAreaElement).value;
        const crimeSeverity = (document.getElementById('crimeSeverity') as HTMLSelectElement).value;

        if (!crimeType || !crimeLocation || !crimeDescription) {
            alert('Please fill in all required fields');
            return;
        }
        if (!user) {
            alert('Please log in to submit a report.');
            return;
        }

        const report = {
            userId: user.uid,
            crimeType,
            crimeLocation,
            crimeDescription,
            crimeSeverity,
            timestamp: Date.now(),
            accurate: 1, // Auto-vote accurate
            inaccurate: 0,
            votes: { [user.uid]: 'accurate' },
        };
        push(ref(db, 'reports'), report);

        (document.getElementById('crimeType') as HTMLSelectElement).value = '';
        (document.getElementById('crimeLocation') as HTMLInputElement).value = '';
        (document.getElementById('crimeDescription') as HTMLTextAreaElement).value = '';
        (document.getElementById('crimeSeverity') as HTMLSelectElement).value = 'low';

        alert('Report submitted successfully!');
    };

    const vote = async (reportId: string, voteType: string) => {
        if (!user) {
            alert('Please log in to vote.');
            return;
        }
        const prevVote = userVotes[reportId];
        const newVoteField = voteType === 'correct' ? 'accurate' : 'inaccurate';
        const prevVoteField = prevVote === 'accurate' ? 'accurate' : prevVote === 'inaccurate' ? 'inaccurate' : null;
        // If already voted for this option, do nothing
        if (prevVoteField === newVoteField) return;
        const updates: any = {};
        updates[`reports/${reportId}/votes/${user.uid}`] = newVoteField;
        updates[`reports/${reportId}/${newVoteField}`] = increment(1);
        if (prevVoteField) {
            updates[`reports/${reportId}/${prevVoteField}`] = increment(-1);
        }
        await update(ref(db), updates);
    };

    const deleteRoute = async (routeId: string) => {
        if (!user) {
            alert('Please log in to delete routes.');
            return;
        }

        try {
            // Find the route to get its CO2 data
            const routeToDelete = savedRoutes.find(route => route.id === routeId);
            if (!routeToDelete) {
                alert('Route not found.');
                return;
            }

            // Calculate CO2 to subtract (same calculation as when saving)
            let co2ToSubtract = 0;
            if (routeToDelete.routeData && routeToDelete.routeData.distance_meters) {
                co2ToSubtract = (routeToDelete.routeData.distance_meters / 1000) * 0.2; // 0.2kg CO2 per km
            }

            // Delete the route from Firebase
            await remove(ref(db, `users/${user.uid}/savedRoutes/${routeId}`));

            // Update CO2 saved (subtract the CO2 that was saved from this route)
            if (co2ToSubtract > 0) {
                await update(ref(db, `users/${user.uid}`), { 
                    co2Saved: increment(-co2ToSubtract) 
                });
            }

        } catch (error) {
            console.error('Error deleting route:', error);
        }
    };

    const loadRoute = (route: any) => {
        // Set the route to load into the form
        setRouteToLoad(route);
    };

  return (
    <div className="dashboard-container">
      {/* Mobile Menu Button */}
      <button className="mobile-menu-btn" onClick={toggleLeftSidebar}>
        <Menu />
      </button>

      {/* Left Sidebar - Route Maker */}
      <aside className={`left-sidebar ${leftSidebarOpen ? 'open' : 'closed'}`} id="leftSidebar">
        {process.env.NEXT_PUBLIC_MAPTILER_API_KEY_1 && process.env.NEXT_PUBLIC_MAPTILER_API_KEY_2 ? (
          <RouteCard
            apiKey1={process.env.NEXT_PUBLIC_MAPTILER_API_KEY_1}
            apiKey2={process.env.NEXT_PUBLIC_MAPTILER_API_KEY_2}
            routeToLoad={routeToLoad}
            onRouteLoaded={() => setRouteToLoad(null)}
          />
        ) : (
          <div className="route-maker">
            <h2>
              <Route />
              Route Planner
            </h2>
            <p>MapTiler API keys are not configured. Please set NEXT_PUBLIC_MAPTILER_API_KEY_1 and NEXT_PUBLIC_MAPTILER_API_KEY_2 in your .env.local file.</p>
          </div>
        )}
        <div className="saved-routes-section" style={{ marginTop: '20px' }}>
          <label>Saved Routes ({savedRoutes.length})</label>
          <button className="view-routes-btn" onClick={() => setIsSavedRoutesPopupOpen(true)}>
            View All Routes
          </button>
          <div style={{ marginTop: '10px', fontWeight: 'bold', color: 'var(--dark-green)' }}>
            CO₂ Emissions Saved: {co2Saved.toFixed(2)} kg
          </div>
        </div>
      </aside>

      {isSavedRoutesPopupOpen && (
        <SavedRoutesPopup 
          routes={savedRoutes} 
          onClose={() => setIsSavedRoutesPopupOpen(false)} 
          onDeleteRoute={deleteRoute}
          onLoadRoute={loadRoute}
        />
      )}

      {/* Right Sidebar Toggle */}
      <button className="right-toggle" onClick={toggleRightSidebar}>
        {rightSidebarOpen ? <X id="toggleIcon" /> : <AlertTriangle id="toggleIcon" />}
      </button>

      {/* Right Sidebar - Crime Reporting */}
      <aside className={`right-sidebar ${rightSidebarOpen ? 'open' : ''}`} id="rightSidebar">
        <div className="crime-panel">
          <h3>
            <ShieldAlert />
            Safety Reports
          </h3>

          <div className="tab-buttons">
            <button className={`tab-btn ${currentTab === 'report' ? 'active' : ''}`} onClick={() => switchTab('report')}>
              Report Crime
            </button>
            <button className={`tab-btn ${currentTab === 'view' ? 'active' : ''}`} onClick={() => switchTab('view')}>
              View Reports
            </button>
          </div>

          {/* Report Crime Tab */}
          <div id="reportTab" className={`tab-content ${currentTab === 'report' ? 'active' : ''}`}>
            <div className="crime-form">
              <div className="form-group">
                <label htmlFor="crimeType">Type of Incident</label>
                <select id="crimeType" className="form-input">
                  <option value="">Select incident type</option>
                  <option value="theft">Theft</option>
                  <option value="vandalism">Vandalism</option>
                  <option value="harassment">Harassment</option>
                  <option value="suspicious">Suspicious Activity</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="crimeLocation">Location</label>
                <div className="input-container">
                  <input 
                    type="text" 
                    id="crimeLocation" 
                    className="form-input" 
                    placeholder="Enter location or click on map"
                    ref={crimeLocationInputRef}
                  />
                  <button 
                    type="button"
                    className="current-location-btn"
                    onClick={useCurrentLocationForCrime}
                    title="Use current location"
                  >
                    <MapPin size={16} />
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="crimeDescription">Description</label>
                <textarea id="crimeDescription" className="form-input" placeholder="Describe what happened..."></textarea>
              </div>

              <div className="form-group">
                <label htmlFor="crimeSeverity">Severity Level</label>
                <select id="crimeSeverity" className="form-input">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <button className="route-btn" onClick={submitReport}>
                <Send />
                Submit Report
              </button>
            </div>
          </div>

          {/* View Reports Tab */}
          <div id="viewTab" className={`tab-content ${currentTab === 'view' ? 'active' : ''}`}>
            {reports.length === 0 ? (
              <div>No reports yet. Be the first to report an incident!</div>
            ) : (
              reports.sort((a, b) => b.timestamp - a.timestamp).map((report) => (
                <div className="crime-report" key={report.id}>
                  <div className="report-header">
                    <span className={`report-type ${report.crimeSeverity}`}>{report.crimeSeverity.charAt(0).toUpperCase() + report.crimeSeverity.slice(1)}</span>
                    <span className="report-time">{new Date(report.timestamp).toLocaleString()}</span>
                  </div>
                  <strong style={{ color: 'var(--dark-green)' }}>{report.crimeType.charAt(0).toUpperCase() + report.crimeType.slice(1)} at {report.crimeLocation}</strong>
                  <p style={{ fontSize: '14px', color: 'var(--text-light)', margin: '8px 0' }}>{report.crimeDescription}</p>
                  <div className="vote-buttons">
                    <button
                      className={`vote-btn correct${report.accurate > report.inaccurate ? ' leading' : ''}${userVotes[report.id] === 'accurate' ? ' user-voted' : ''}`}
                      onClick={() => vote(report.id, 'correct')}
                    >
                      <ThumbsUp size={16} /> Accurate ({report.accurate || 0})
                    </button>
                    <button
                      className={`vote-btn incorrect${report.inaccurate > report.accurate ? ' leading' : ''}${userVotes[report.id] === 'inaccurate' ? ' user-voted' : ''}`}
                      onClick={() => vote(report.id, 'incorrect')}
                    >
                      <ThumbsDown size={16} /> Inaccurate ({report.inaccurate || 0})
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
            {/* Bottom Navigation Bar */}
            <BottomNavBar />
        </div>
    );
}
