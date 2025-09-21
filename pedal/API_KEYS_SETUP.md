# API Keys Setup Guide

## Required API Keys

To use all features of the Pedal web app, you'll need to set up the following API keys in your `.env.local` file:

### 1. MapTiler API Keys (for map display)
```
NEXT_PUBLIC_MAPTILER_API_KEY_1=your_maptiler_api_key_1
NEXT_PUBLIC_MAPTILER_API_KEY_2=your_maptiler_api_key_2
```

### 2. Google Maps API Key (for address autocomplete and geolocation)
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## Google Maps API Setup

Make sure your Google Maps API key has the following APIs enabled:
- **Places API** (for address autocomplete)
- **Geocoding API** (for reverse geocoding current location)
- **Maps JavaScript API** (for general maps functionality)
- **Directions API** (for turn-by-turn navigation and fastest route calculations)

## Features Enabled

With these API keys configured, you'll have:

✅ **Draggable and zoomable map** on the dashboard
✅ **Auto-zoom to routes** when routes are displayed
✅ **Google Maps address autocomplete** for starting point and destination
✅ **Current location button** (📍) for both start and destination inputs
✅ **Geolocation integration** for proximity-based suggestions
✅ **Multiple stops support** - add intermediate waypoints to your route
✅ **Smart routing** - uses Google Directions for fastest routes, backend API for safety/bike routes
✅ **Turn-by-turn navigation** - detailed step-by-step directions with distances and times
✅ **Combined route analytics** - aggregated distance, time, safety, and emissions data
✅ **Multi-segment API calls** - automatically handles complex routes with multiple stops

## Routing Logic

- **Fastest routes**: Uses Google Directions API with bicycle mode for optimal navigation
- **Safety/Bike routes**: Uses backend API for specialized routing based on safety scores and bike infrastructure
- **Multiple stops**: Automatically handles waypoints with either Google Directions or segmented backend API calls
- **Fallback support**: If Google Directions fails, falls back to backend API for multi-stop routes

## Fallback Behavior

- If Google Maps API is not available, the app will fall back to MapTiler geocoding for address suggestions
- If geolocation is disabled, the app will use a default location (Indianapolis area) for proximity-based suggestions
- If Google Directions fails for multi-stop routes, the app will use backend API with individual segment calls
