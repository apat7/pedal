"""
FastAPI Backend for Eco-Friendly Navigation System

This is the main FastAPI application providing routing endpoints for pedestrian
and bike-friendly navigation. It serves 4 different routing algorithms optimized
for safety and bike infrastructure.

Endpoints:
- POST /route: Calculate a single route
- POST /route/compare: Compare multiple route types
- GET /health: Health check and system status
- GET /stats: Graph and system statistics
- GET /modes: Available routing modes
"""

import os
import sys
import time
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Dict, Optional, Union
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, validator
import uvicorn

# Add backend directory to path for imports
backend_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(backend_dir))

from crime_analyzer import CrimeDataAnalyzer
from osm_analyzer import OSMAnalyzer
from weight_calibrator import WeightCalibrator
from graph_builder import WeightedGraphBuilder
from route_calculator import RouteCalculator, RouteRequest, RouteResult

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global application state
app_state = {
    'initialized': False,
    'crime_analyzer': None,
    'osm_analyzer': None,
    'graph_builder': None,
    'route_calculator': None,
    'calibrated_weights': None,
    'initialization_time': 0,
    'startup_errors': []
}


# Pydantic models for API requests/responses
class RouteRequestModel(BaseModel):
    """Route calculation request model"""
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    route_type: str
    algorithm: str = 'dijkstra'
    
    @validator('start_lat', 'end_lat')
    def validate_latitude(cls, v):
        if not -90 <= v <= 90:
            raise ValueError('Latitude must be between -90 and 90')
        return v
    
    @validator('start_lon', 'end_lon')  
    def validate_longitude(cls, v):
        if not -180 <= v <= 180:
            raise ValueError('Longitude must be between -180 and 180')
        return v
    
    @validator('route_type')
    def validate_route_type(cls, v):
        valid_types = ['fastest', 'safe', 'bike', 'safe_bike']
        if v not in valid_types:
            raise ValueError(f'Route type must be one of: {valid_types}')
        return v
    
    @validator('algorithm')
    def validate_algorithm(cls, v):
        valid_algorithms = ['dijkstra', 'astar']
        if v not in valid_algorithms:
            raise ValueError(f'Algorithm must be one of: {valid_algorithms}')
        return v


class RouteCompareRequestModel(BaseModel):
    """Route comparison request model"""
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    route_types: Optional[List[str]] = None
    algorithm: str = 'dijkstra'
    
    @validator('start_lat', 'end_lat')
    def validate_latitude(cls, v):
        if not -90 <= v <= 90:
            raise ValueError('Latitude must be between -90 and 90')
        return v
    
    @validator('start_lon', 'end_lon')
    def validate_longitude(cls, v):
        if not -180 <= v <= 180:
            raise ValueError('Longitude must be between -180 and 180')
        return v


class RouteResponseModel(BaseModel):
    """Route calculation response model"""
    route: List[List[float]]
    distance_meters: float
    estimated_time_minutes: float
    safety_score: float
    bike_coverage_percent: float
    route_type: str
    algorithm_used: str
    calculation_time_ms: float
    node_count: int
    error_message: Optional[str] = None


class HealthResponseModel(BaseModel):
    """Health check response model"""
    status: str
    initialized: bool
    system_info: Dict
    graph_stats: Optional[Dict] = None
    errors: List[str] = []


class RouteModesResponseModel(BaseModel):
    """Available routing modes response"""
    modes: Dict[str, Dict[str, str]]


async def initialize_system():
    """Initialize all system components during startup"""
    startup_start = time.time()
    
    try:
        logger.info("Starting system initialization...")
        
        # Set up file paths
        data_dir = backend_dir.parent  # Root directory where CSV/JSON files are located
        indy_csv_path = data_dir / "IndianapolisCrime.csv"
        wl_json_path = data_dir / "WLCrime.json"
        
        # Verify data files exist
        if not indy_csv_path.exists():
            raise FileNotFoundError(f"Indianapolis crime data not found: {indy_csv_path}")
        
        if not wl_json_path.exists():
            raise FileNotFoundError(f"West Lafayette crime data not found: {wl_json_path}")
        
        logger.info(f"Found crime data files: {indy_csv_path}, {wl_json_path}")
        
        # Initialize crime analyzer
        logger.info("Initializing crime data analyzer...")
        crime_analyzer = CrimeDataAnalyzer()
        crime_results = crime_analyzer.analyze_crime_data(str(indy_csv_path), str(wl_json_path))
        app_state['crime_analyzer'] = crime_analyzer
        logger.info(f"Crime analysis complete: {crime_results.get('total_crime_count', 0)} records processed")
        
        # Initialize OSM analyzer
        logger.info("Initializing OSM network analyzer...")
        osm_analyzer = OSMAnalyzer()
        osm_results = osm_analyzer.analyze_osm_networks()
        app_state['osm_analyzer'] = osm_analyzer
        logger.info(f"OSM analysis complete: {osm_results.get('total_cities', 0)} cities loaded")
        
        # Initialize weight calibrator and run calibration
        logger.info("Running weight calibration...")
        calibrator = WeightCalibrator()
        calibrated_weights = calibrator.master_calibration(str(indy_csv_path), str(wl_json_path))
        app_state['calibrated_weights'] = calibrated_weights
        logger.info("Weight calibration complete")
        
        # Initialize graph builder
        logger.info("Building weighted graphs...")
        graph_builder = WeightedGraphBuilder()
        
        # Load base graph from OSM analyzer
        combined_graph = osm_analyzer.export_network_for_routing()
        if combined_graph is None or combined_graph.number_of_nodes() == 0:
            raise ValueError("No valid road network available from OSM analysis")
        
        graph_builder.load_base_graph(combined_graph)
        graph_builder.load_calibrated_weights(calibrated_weights)
        graph_builder.set_crime_analyzer(crime_analyzer)
        
        # Create all weighted graphs
        weighted_graphs = graph_builder.create_weighted_graphs()
        app_state['graph_builder'] = graph_builder
        logger.info(f"Created {len(weighted_graphs)} weighted graphs")
        
        # Validate graphs
        validation_results = graph_builder.validate_graphs()
        invalid_graphs = [name for name, result in validation_results.items() if not result['valid']]
        if invalid_graphs:
            logger.warning(f"Some graphs failed validation: {invalid_graphs}")
        
        # Initialize route calculator
        logger.info("Initializing route calculator...")
        route_calculator = RouteCalculator()
        if not route_calculator.initialize(graph_builder, crime_analyzer):
            raise RuntimeError("Failed to initialize route calculator")
        
        app_state['route_calculator'] = route_calculator
        logger.info("Route calculator initialization complete")
        
        # Mark initialization as complete
        app_state['initialized'] = True
        app_state['initialization_time'] = time.time() - startup_start
        
        logger.info(f"System initialization complete in {app_state['initialization_time']:.2f} seconds")
        
    except Exception as e:
        error_msg = f"System initialization failed: {str(e)}"
        logger.error(error_msg)
        app_state['startup_errors'].append(error_msg)
        app_state['initialized'] = False
        
        # Don't raise exception - let the server start but mark as not initialized
        # This allows health checks to report the error


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager for startup/shutdown"""
    # Startup
    await initialize_system()
    yield
    # Shutdown
    logger.info("System shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Eco-Friendly Navigation API",
    description="FastAPI backend for pedestrian and bike-friendly routing",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# API Endpoints

@app.get("/health", response_model=HealthResponseModel)
async def health_check():
    """Health check endpoint with system status"""
    
    system_info = {
        'initialization_time_seconds': app_state.get('initialization_time', 0),
        'python_version': sys.version,
        'backend_directory': str(backend_dir),
    }
    
    # Add graph statistics if available
    graph_stats = None
    if app_state['initialized'] and app_state['route_calculator']:
        try:
            graph_stats = app_state['route_calculator'].get_route_statistics()
        except Exception as e:
            system_info['stats_error'] = str(e)
    
    status = "healthy" if app_state['initialized'] and not app_state['startup_errors'] else "unhealthy"
    
    return HealthResponseModel(
        status=status,
        initialized=app_state['initialized'],
        system_info=system_info,
        graph_stats=graph_stats,
        errors=app_state['startup_errors']
    )


@app.get("/modes", response_model=RouteModesResponseModel)
async def get_available_modes():
    """Get available routing modes with descriptions"""
    
    modes = {
        "fastest": {
            "name": "Fastest Route",
            "description": "Shortest distance route without penalties"
        },
        "safe": {
            "name": "Safe Route", 
            "description": "Avoids high-crime areas using crime data analysis"
        },
        "bike": {
            "name": "Bike Route",
            "description": "Prioritizes bike lanes and cycling infrastructure"
        },
        "safe_bike": {
            "name": "Safe + Bike Route",
            "description": "Balances safety and bike infrastructure preferences"
        }
    }
    
    return RouteModesResponseModel(modes=modes)


@app.get("/stats")
async def get_system_stats():
    """Get detailed system and graph statistics"""
    
    if not app_state['initialized']:
        raise HTTPException(
            status_code=503,
            detail="System not initialized. Check /health for details."
        )
    
    try:
        stats = app_state['route_calculator'].get_route_statistics()
        
        # Add additional system information
        stats.update({
            'initialization_time_seconds': app_state['initialization_time'],
            'initialized': app_state['initialized'],
            'startup_errors': app_state['startup_errors']
        })
        
        # Add crime analysis stats if available
        if app_state['calibrated_weights']:
            crime_stats = app_state['calibrated_weights'].calibration_stats.get('crime_analysis', {})
            stats['crime_analysis'] = {
                'total_crimes': crime_stats.get('total_crime_count', 0),
                'indy_crimes': crime_stats.get('indy_crime_count', 0),
                'wl_crimes': crime_stats.get('wl_crime_count', 0),
                'crime_types_mapped': len(crime_stats.get('crime_type_weights', {}))
            }
        
        return stats
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving statistics: {str(e)}")


@app.post("/route", response_model=RouteResponseModel)
async def calculate_route(request: RouteRequestModel):
    """Calculate a single route between two points"""
    
    if not app_state['initialized']:
        raise HTTPException(
            status_code=503,
            detail="System not initialized. Check /health for details."
        )
    
    try:
        # Convert to internal request format
        internal_request = RouteRequest(
            start_lat=request.start_lat,
            start_lon=request.start_lon,
            end_lat=request.end_lat,
            end_lon=request.end_lon,
            route_type=request.route_type,
            algorithm=request.algorithm
        )
        
        # Calculate route
        result = app_state['route_calculator'].calculate_route(internal_request)
        
        # Convert to response format
        response = RouteResponseModel(
            route=result.route,
            distance_meters=result.distance_meters,
            estimated_time_minutes=result.estimated_time_minutes,
            safety_score=result.safety_score,
            bike_coverage_percent=result.bike_coverage_percent,
            route_type=result.route_type,
            algorithm_used=result.algorithm_used,
            calculation_time_ms=result.calculation_time_ms,
            node_count=result.node_count,
            error_message=result.error_message
        )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route calculation failed: {str(e)}")


@app.post("/route/compare")
async def compare_routes(request: RouteCompareRequestModel):
    """Compare multiple route types for the same start/end points"""
    
    if not app_state['initialized']:
        raise HTTPException(
            status_code=503,
            detail="System not initialized. Check /health for details."
        )
    
    try:
        # Use provided route types or default to all available
        route_types = request.route_types
        if route_types is None:
            route_types = ['fastest', 'safe', 'bike', 'safe_bike']
        
        # Calculate comparison routes
        results = app_state['route_calculator'].compare_routes(
            start_lat=request.start_lat,
            start_lon=request.start_lon,
            end_lat=request.end_lat,
            end_lon=request.end_lon,
            route_types=route_types,
            algorithm=request.algorithm
        )
        
        # Convert to response format
        response = {}
        for route_type, result in results.items():
            response[route_type] = RouteResponseModel(
                route=result.route,
                distance_meters=result.distance_meters,
                estimated_time_minutes=result.estimated_time_minutes,
                safety_score=result.safety_score,
                bike_coverage_percent=result.bike_coverage_percent,
                route_type=result.route_type,
                algorithm_used=result.algorithm_used,
                calculation_time_ms=result.calculation_time_ms,
                node_count=result.node_count,
                error_message=result.error_message
            )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route comparison failed: {str(e)}")


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors"""
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error occurred"}
    )


# Development server startup
if __name__ == "__main__":
    # Configure for development
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # Disabled due to lifespan initialization
        log_level="info"
    )
