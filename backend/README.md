# Eco-Friendly Navigation Backend

A FastAPI backend for an eco-friendly navigation system targeting Purdue (West Lafayette) and Indianapolis. Provides 4 distinct routing options optimized for non-car transportation using crime data analysis and OpenStreetMap bike infrastructure.

## Features

- **4 Routing Algorithms**:
  - `fastest`: Shortest distance route
  - `safe`: Avoids high-crime areas using crime data analysis
  - `bike`: Prioritizes bike lanes and cycling infrastructure
  - `safe_bike`: Balances safety and bike infrastructure preferences

- **Crime Data Analysis**: Processes Indianapolis CSV and West Lafayette JSON crime data
- **OpenStreetMap Integration**: Downloads and analyzes bike infrastructure
- **Weight Calibration**: Automatically calibrates routing weights based on data analysis
- **FastAPI API**: RESTful API with automatic documentation

## Quick Start

### 1. Install Dependencies

```bash
pip install fastapi uvicorn networkx osmnx geopandas pandas numpy scikit-learn shapely rtree requests
```

### 2. Run the Server

```bash
python run_server.py
```

The server will start at `http://localhost:8000`

### 3. Test the API

```bash
python test_api.py
```

## API Endpoints

### Health Check
```
GET /health
```
Returns system status and initialization state.

### Available Routing Modes
```
GET /modes
```
Returns available routing modes and descriptions.

### System Statistics
```
GET /stats
```
Returns detailed system and graph statistics.

### Calculate Route
```
POST /route
```
Calculate a single route between two points.

**Request Body:**
```json
{
  "start_lat": 39.7684,
  "start_lon": -86.1581,
  "end_lat": 39.7391,
  "end_lon": -86.1477,
  "route_type": "fastest",
  "algorithm": "dijkstra"
}
```

**Response:**
```json
{
  "route": [[39.7684, -86.1581], [39.7391, -86.1477]],
  "distance_meters": 3500.0,
  "estimated_time_minutes": 14.0,
  "safety_score": 8.5,
  "bike_coverage_percent": 25.0,
  "route_type": "fastest",
  "algorithm_used": "dijkstra",
  "calculation_time_ms": 45.2,
  "node_count": 15
}
```

### Compare Routes
```
POST /route/compare
```
Compare multiple route types for the same start/end points.

**Request Body:**
```json
{
  "start_lat": 39.7684,
  "start_lon": -86.1581,
  "end_lat": 39.7391,
  "end_lon": -86.1477,
  "route_types": ["fastest", "safe", "bike", "safe_bike"],
  "algorithm": "dijkstra"
}
```

## System Architecture

### Core Modules

1. **CrimeDataAnalyzer** (`crime_analyzer.py`)
   - Loads and processes crime data from CSV and JSON files
   - Creates spatial crime density surfaces
   - Assigns severity weights to different crime types

2. **OSMAnalyzer** (`osm_analyzer.py`)
   - Downloads road networks from OpenStreetMap
   - Identifies bike infrastructure and bike-friendly roads
   - Calculates optimal bike bonus factors

3. **WeightCalibrator** (`weight_calibrator.py`)
   - Coordinates crime and OSM analysis
   - Calculates optimal routing weights
   - Tests route differentiation

4. **WeightedGraphBuilder** (`graph_builder.py`)
   - Creates four different weighted graphs
   - Applies crime penalties and bike bonuses
   - Validates graph correctness

5. **RouteCalculator** (`route_calculator.py`)
   - Calculates routes using Dijkstra or A* algorithms
   - Provides comprehensive route statistics
   - Handles routing errors and fallbacks

### Data Sources

- **Indianapolis Crime Data**: `IndianapolisCrime.csv`
  - Format: OBJECTID, UCR, CRIME, DATE_, TIME, CASE, ADDRESS, BEAT, LATITUDE, LONGITUDE
  - Geographic bounds: North 39.9288, South 39.6323, East -85.9379, West -86.3266

- **West Lafayette Crime Data**: `WLCrime.json`
  - Format: JSON with location.coordinates array [longitude, latitude]
  - Geographic bounds: North 40.4704, South 40.3935, East -86.8942, West -86.9363

## Configuration

### Route Types

- **fastest**: Distance only (no penalties or bonuses)
- **safe**: Distance + crime penalty
- **bike**: Distance - bike bonus
- **safe_bike**: Distance + crime penalty - bike bonus

### Algorithms

- **dijkstra**: Standard shortest path algorithm
- **astar**: A* algorithm with Euclidean heuristic

## Performance

- **Startup Time**: 30-60 seconds (includes data loading and OSM download)
- **Route Calculation**: <500ms for typical requests
- **Memory Usage**: <2GB during normal operation
- **Concurrent Requests**: Supports multiple simultaneous requests

## Error Handling

The system includes comprehensive error handling for:

- **OSM Download Failures**: Automatic retry with fallback strategies
- **Crime Data Issues**: Graceful handling of missing or malformed data
- **Routing Failures**: Fallback to alternative nodes and routes
- **Memory Management**: Optimized for large datasets

## Development

### Running Tests

```bash
# Test basic functionality
python simple_test.py

# Test without OSM (faster)
python test_without_osm.py

# Test full system (may take several minutes)
python test_system.py
```

### API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Troubleshooting

### Common Issues

1. **Server won't start**: Check that all dependencies are installed
2. **OSM download fails**: Check internet connection and try again
3. **Route calculation fails**: Ensure coordinates are within service area
4. **Memory issues**: Reduce dataset size or increase system memory

### Logs

The server provides detailed logging for debugging:
- Crime data processing logs
- OSM download progress
- Route calculation statistics
- Error messages and stack traces

## License

This project is part of an eco-friendly navigation system for educational and research purposes.