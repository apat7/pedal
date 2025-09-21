"""
Route Calculator Module

This module handles route calculation using NetworkX shortest path algorithms.
It provides functionality for:
- Finding nearest nodes to coordinates using spatial indexing
- Calculating routes for all 4 route types
- Computing route statistics (distance, time, safety score, bike coverage)
- Handling routing errors and fallback strategies
"""

import networkx as nx
import numpy as np
from typing import Dict, List, Tuple, Optional, Union
from dataclasses import dataclass
from scipy.spatial import cKDTree
import time
import math

try:
    from graph_builder import WeightedGraphBuilder
    from crime_analyzer import CrimeDataAnalyzer
except ImportError:
    from .graph_builder import WeightedGraphBuilder
    from .crime_analyzer import CrimeDataAnalyzer


@dataclass
class RouteRequest:
    """Route calculation request parameters"""
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    route_type: str
    algorithm: str = 'dijkstra'  # 'dijkstra' or 'astar'


@dataclass
class RouteResult:
    """Route calculation result"""
    route: List[List[float]]  # [[lat, lon], [lat, lon], ...]
    distance_meters: float
    estimated_time_minutes: float
    safety_score: float  # 1-10 scale, higher = safer
    bike_coverage_percent: float
    route_type: str
    algorithm_used: str
    calculation_time_ms: float
    node_count: int
    error_message: Optional[str] = None


class SpatialIndex:
    """Spatial index for fast nearest node lookup"""

    def __init__(self, graph: nx.MultiDiGraph):
        """Initialize spatial index from graph nodes"""
        self.graph = graph
        self.node_ids = []
        self.coordinates = []

        # Build coordinate arrays
        for node, data in graph.nodes(data=True):
            lat = data.get('y', data.get('lat', 0))
            lon = data.get('x', data.get('lon', 0))

            if lat != 0 and lon != 0:  # Valid coordinates
                self.node_ids.append(node)
                self.coordinates.append([lat, lon])

        if self.coordinates:
            self.coordinates = np.array(self.coordinates)
            self.kdtree = cKDTree(self.coordinates)
            print(f"Built spatial index with {len(self.coordinates)} nodes")
        else:
            self.kdtree = None
            print("Warning: No valid coordinates found for spatial index")

    def find_nearest_node(self, lat: float, lon: float,
                          max_distance_km: float = 1.0) -> Optional[int]:
        """
        Find nearest graph node to given coordinates.

        Args:
            lat: Target latitude
            lon: Target longitude
            max_distance_km: Maximum search distance in kilometers

        Returns:
            Nearest node ID, or None if no node found within max distance
        """
        if self.kdtree is None or not self.coordinates.size:
            return None

        # Convert max distance to degrees (rough approximation)
        max_distance_deg = max_distance_km / 111  # ~111km per degree

        try:
            # Find nearest neighbor
            distance, index = self.kdtree.query([lat, lon], k=1)

            if distance <= max_distance_deg:
                return self.node_ids[index]
            else:
                print(f"Nearest node at distance {distance:.6f} degrees > max {max_distance_deg:.6f} degrees")
                return None

        except Exception as e:
            print(f"Error in nearest node search: {e}")
            return None

    def find_k_nearest_nodes(self, lat: float, lon: float, k: int = 5,
                             max_distance_km: float = 1.0) -> List[int]:
        """Find k nearest nodes within max distance"""
        if self.kdtree is None or not self.coordinates.size:
            return []

        max_distance_deg = max_distance_km / 111

        try:
            # Handle case where k > number of available nodes
            actual_k = min(k, len(self.coordinates))
            distances, indices = self.kdtree.query([lat, lon], k=actual_k)

            # Handle single result (when k=1)
            if not hasattr(distances, '__len__'):
                distances = [distances]
                indices = [indices]

            # Filter by distance and return node IDs
            valid_nodes = []
            for dist, idx in zip(distances, indices):
                if dist <= max_distance_deg:
                    valid_nodes.append(self.node_ids[idx])

            return valid_nodes

        except Exception as e:
            print(f"Error in k-nearest search: {e}")
            return []


class RouteCalculator:
    """
    Calculates routes using different algorithms and provides comprehensive
    route statistics and analysis.
    """

    def __init__(self):
        self.graph_builder: Optional[WeightedGraphBuilder] = None
        self.crime_analyzer: Optional[CrimeDataAnalyzer] = None
        self.spatial_indices: Dict[str, SpatialIndex] = {}
        self.route_stats_cache: Dict[str, Dict] = {}
        self._current_graph: Optional[nx.MultiDiGraph] = None  # For A* heuristic

        # Configuration
        self.default_speed_kmh = 15.0  # Average cycling/walking speed
        self.max_search_distance_km = 2.0  # Maximum distance to search for nodes

        # Algorithm configuration
        self.algorithm_config = {
            'dijkstra': {'weight': 'weight'},
            'astar': {'weight': 'weight', 'heuristic': self._astar_heuristic}
        }

    def initialize(self, graph_builder: WeightedGraphBuilder,
                   crime_analyzer: Optional[CrimeDataAnalyzer] = None) -> bool:
        """
        Initialize route calculator with graph builder and optional crime analyzer.

        Args:
            graph_builder: WeightedGraphBuilder with loaded graphs
            crime_analyzer: Optional CrimeDataAnalyzer for safety scoring

        Returns:
            True if initialization successful, False otherwise
        """
        if graph_builder is None:
            print("Error: Graph builder is None")
            return False

        if not hasattr(graph_builder, 'weighted_graphs') or not graph_builder.weighted_graphs:
            print("Error: Graph builder has no weighted graphs")
            return False

        self.graph_builder = graph_builder
        self.crime_analyzer = crime_analyzer

        # Build spatial indices for all graph types
        print("Building spatial indices...")
        success_count = 0

        for route_type, graph in graph_builder.weighted_graphs.items():
            try:
                if graph is None:
                    print(f"  {route_type}: graph is None, skipping")
                    continue

                index = SpatialIndex(graph)
                if index.kdtree is not None:
                    self.spatial_indices[route_type] = index
                    success_count += 1
                    print(f"  {route_type}: spatial index ready")
                else:
                    print(f"  {route_type}: failed to build spatial index - no valid coordinates")

            except Exception as e:
                print(f"  {route_type}: failed to build spatial index - {e}")

        if success_count == 0:
            print("Error: No spatial indices could be built")
            return False

        print(f"Route calculator initialization complete ({success_count} indices built)")
        return True

    def calculate_route(self, request: RouteRequest) -> RouteResult:
        """
        Calculate a route based on the provided request.

        Args:
            request: RouteRequest with start/end coordinates and preferences

        Returns:
            RouteResult with calculated route and statistics
        """
        start_time = time.time()

        # Validate request
        validation_error = self._validate_request(request)
        if validation_error:
            return RouteResult(
                route=[], distance_meters=0, estimated_time_minutes=0,
                safety_score=0, bike_coverage_percent=0,
                route_type=request.route_type, algorithm_used=request.algorithm,
                calculation_time_ms=0, node_count=0, error_message=validation_error
            )

        # Get appropriate graph and spatial index
        graph = self.graph_builder.get_graph(request.route_type) if self.graph_builder else None
        spatial_index = self.spatial_indices.get(request.route_type)

        if graph is None or spatial_index is None:
            return RouteResult(
                route=[], distance_meters=0, estimated_time_minutes=0,
                safety_score=0, bike_coverage_percent=0,
                route_type=request.route_type, algorithm_used=request.algorithm,
                calculation_time_ms=0, node_count=0,
                error_message=f"Graph or spatial index not available for {request.route_type}"
            )

        try:
            # Set current graph for A* heuristic
            self._current_graph = graph

            # Find nearest nodes
            start_node = spatial_index.find_nearest_node(
                request.start_lat, request.start_lon, self.max_search_distance_km
            )
            end_node = spatial_index.find_nearest_node(
                request.end_lat, request.end_lon, self.max_search_distance_km
            )

            if start_node is None:
                return self._create_error_result(
                    request, "Could not find start node within search radius",
                    start_time
                )

            if end_node is None:
                return self._create_error_result(
                    request, "Could not find end node within search radius",
                    start_time
                )

            if start_node == end_node:
                return self._create_error_result(
                    request, "Start and end nodes are the same",
                    start_time
                )

            # Calculate route using specified algorithm
            path = self._calculate_shortest_path(
                graph, start_node, end_node, request.algorithm
            )

            if not path:
                # Try fallback with alternative nodes
                path = self._try_fallback_routing(
                    graph, spatial_index, request
                )

                if not path:
                    return self._create_error_result(
                        request, "No route found between specified points",
                        start_time
                    )

            # Convert path to coordinates
            route_coords = self._path_to_coordinates(graph, path)

            # Calculate route statistics
            stats = self._calculate_route_statistics(graph, path, request.route_type)

            calculation_time = (time.time() - start_time) * 1000

            return RouteResult(
                route=route_coords,
                distance_meters=stats['distance_meters'],
                estimated_time_minutes=stats['estimated_time_minutes'],
                safety_score=stats['safety_score'],
                bike_coverage_percent=stats['bike_coverage_percent'],
                route_type=request.route_type,
                algorithm_used=request.algorithm,
                calculation_time_ms=calculation_time,
                node_count=len(path)
            )

        except Exception as e:
            return self._create_error_result(
                request, f"Route calculation error: {str(e)}", start_time
            )
        finally:
            # Clean up
            self._current_graph = None

    def _validate_request(self, request: RouteRequest) -> Optional[str]:
        """Validate route request parameters"""

        # Check if initialized
        if self.graph_builder is None:
            return "Route calculator not initialized"

        # Check coordinate validity
        if not (-90 <= request.start_lat <= 90):
            return f"Invalid start latitude: {request.start_lat}"
        if not (-180 <= request.start_lon <= 180):
            return f"Invalid start longitude: {request.start_lon}"
        if not (-90 <= request.end_lat <= 90):
            return f"Invalid end latitude: {request.end_lat}"
        if not (-180 <= request.end_lon <= 180):
            return f"Invalid end longitude: {request.end_lon}"

        # Check route type
        available_types = list(self.graph_builder.weighted_graphs.keys())
        if request.route_type not in available_types:
            return f"Invalid route type: {request.route_type}. Available: {available_types}"

        # Check algorithm
        if request.algorithm not in self.algorithm_config:
            available_algorithms = list(self.algorithm_config.keys())
            return f"Invalid algorithm: {request.algorithm}. Available: {available_algorithms}"

        return None

    def _calculate_shortest_path(self, graph: nx.MultiDiGraph, start: int, end: int,
                                 algorithm: str) -> Optional[List[int]]:
        """Calculate shortest path using specified algorithm"""

        try:
            if algorithm == 'dijkstra':
                path = nx.shortest_path(graph, start, end, weight='weight')
                return path

            elif algorithm == 'astar':
                path = nx.astar_path(
                    graph, start, end,
                    heuristic=self._astar_heuristic,
                    weight='weight'
                )
                return path

            else:
                print(f"Unknown algorithm: {algorithm}")
                return None

        except nx.NetworkXNoPath:
            print(f"No path found between nodes {start} and {end}")
            return None
        except Exception as e:
            print(f"Path calculation error: {e}")
            return None

    def _astar_heuristic(self, node1: int, node2: int) -> float:
        """A* heuristic function - Euclidean distance"""
        try:
            # Use current graph set during calculation
            if self._current_graph is None:
                return 0.0

            graph = self._current_graph

            # Check if nodes exist in graph
            if node1 not in graph.nodes or node2 not in graph.nodes:
                return 0.0

            # Get node coordinates
            data1 = graph.nodes[node1]
            data2 = graph.nodes[node2]

            # Try different coordinate field names
            lat1 = data1.get('y', data1.get('lat', 0))
            lon1 = data1.get('x', data1.get('lon', 0))
            lat2 = data2.get('y', data2.get('lat', 0))
            lon2 = data2.get('x', data2.get('lon', 0))

            if lat1 == 0 or lon1 == 0 or lat2 == 0 or lon2 == 0:
                return 0.0

            # Calculate great circle distance
            return self._calculate_haversine_distance(lat1, lon1, lat2, lon2)

        except Exception as e:
            print(f"A* heuristic calculation error: {e}")
            return 0.0

    def _calculate_haversine_distance(self, lat1: float, lon1: float,
                                      lat2: float, lon2: float) -> float:
        """Calculate distance between two points using Haversine formula"""
        R = 6371000  # Earth's radius in meters

        # Convert to radians
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)
        lat2_rad = math.radians(lat2)
        lon2_rad = math.radians(lon2)

        # Haversine formula
        dlat = lat2_rad - lat1_rad
        dlon = lon2_rad - lon1_rad

        a = (math.sin(dlat/2)**2 +
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

        return R * c

    def _try_fallback_routing(self, graph: nx.MultiDiGraph, spatial_index: SpatialIndex,
                              request: RouteRequest) -> Optional[List[int]]:
        """Try alternative nodes if direct routing fails"""

        # Get multiple candidate nodes for start and end
        start_candidates = spatial_index.find_k_nearest_nodes(
            request.start_lat, request.start_lon, k=5,
            max_distance_km=self.max_search_distance_km * 1.5  # Expand search
        )
        end_candidates = spatial_index.find_k_nearest_nodes(
            request.end_lat, request.end_lon, k=5,
            max_distance_km=self.max_search_distance_km * 1.5
        )

        if not start_candidates or not end_candidates:
            print("No candidate nodes found for fallback routing")
            return None

        # Try different combinations
        for start_node in start_candidates:
            for end_node in end_candidates:
                if start_node != end_node:
                    path = self._calculate_shortest_path(
                        graph, start_node, end_node, request.algorithm
                    )
                    if path:
                        print(f"Found fallback route using nodes {start_node} -> {end_node}")
                        return path

        return None

    def _path_to_coordinates(self, graph: nx.MultiDiGraph, path: List[int]) -> List[List[float]]:
        """Convert node path to coordinate list"""
        coordinates = []

        for node in path:
            if node not in graph.nodes:
                print(f"Warning: Node {node} not found in graph")
                continue

            node_data = graph.nodes[node]
            lat = node_data.get('y', node_data.get('lat', 0))
            lon = node_data.get('x', node_data.get('lon', 0))

            if lat != 0 and lon != 0:
                coordinates.append([lat, lon])
            else:
                print(f"Warning: Invalid coordinates for node {node}: lat={lat}, lon={lon}")

        return coordinates

    def _calculate_route_statistics(self, graph: nx.MultiDiGraph, path: List[int],
                                    route_type: str) -> Dict:
        """Calculate comprehensive route statistics"""

        if len(path) < 2:
            return {
                'distance_meters': 0,
                'estimated_time_minutes': 0,
                'safety_score': 5.0,
                'bike_coverage_percent': 0
            }

        total_distance = 0
        bike_distance = 0
        crime_scores = []

        # Analyze each edge in the path
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]

            # Find the edge data (handle MultiDiGraph)
            edge_data = None
            if graph.has_edge(u, v):
                edges = graph[u][v]
                if isinstance(edges, dict):
                    # Multiple edges - take the first one or find best one
                    if 0 in edges:
                        edge_data = edges[0]
                    else:
                        # Take first available edge
                        edge_data = next(iter(edges.values()))
                else:
                    edge_data = edges

            if edge_data:
                # Add to total distance
                segment_length = edge_data.get('length', edge_data.get('weight', 0))

                # If no length, calculate from coordinates
                if segment_length == 0:
                    u_data = graph.nodes[u]
                    v_data = graph.nodes[v]
                    u_lat = u_data.get('y', u_data.get('lat', 0))
                    u_lon = u_data.get('x', u_data.get('lon', 0))
                    v_lat = v_data.get('y', v_data.get('lat', 0))
                    v_lon = v_data.get('x', v_data.get('lon', 0))

                    if all(coord != 0 for coord in [u_lat, u_lon, v_lat, v_lon]):
                        segment_length = self._calculate_haversine_distance(u_lat, u_lon, v_lat, v_lon)

                total_distance += segment_length

                # Check for bike infrastructure
                if (edge_data.get('has_bike_lane', False) or
                        edge_data.get('bicycle', '') in ['yes', 'designated'] or
                        edge_data.get('highway', '') == 'cycleway'):
                    bike_distance += segment_length

                # Calculate crime score for this segment
                if self.crime_analyzer is not None:
                    try:
                        u_data = graph.nodes[u]
                        v_data = graph.nodes[v]
                        u_lat = u_data.get('y', u_data.get('lat', 0))
                        u_lon = u_data.get('x', u_data.get('lon', 0))
                        v_lat = v_data.get('y', v_data.get('lat', 0))
                        v_lon = v_data.get('x', v_data.get('lon', 0))

                        if all(coord != 0 for coord in [u_lat, u_lon, v_lat, v_lon]):
                            mid_lat = (u_lat + v_lat) / 2
                            mid_lon = (u_lon + v_lon) / 2

                            crime_density = self.crime_analyzer.get_crime_density_at_point(mid_lat, mid_lon)

                            # Convert crime density to safety score (1-10 scale)
                            if crime_density > 0:
                                # Adjust max_observed_density based on your data
                                max_observed_density = 0.001
                                normalized_density = min(crime_density / max_observed_density, 1.0)
                                safety_score = (1 - normalized_density) * 9 + 1
                            else:
                                safety_score = 10.0

                            crime_scores.append(safety_score)
                    except Exception as e:
                        print(f"Error calculating crime score: {e}")
                        crime_scores.append(5.0)  # Default score

        # Calculate final statistics
        distance_meters = max(0, total_distance)
        estimated_time_minutes = (distance_meters / 1000) / self.default_speed_kmh * 60 if distance_meters > 0 else 0

        # Bike coverage percentage
        bike_coverage_percent = (bike_distance / total_distance * 100) if total_distance > 0 else 0

        # Average safety score
        safety_score = np.mean(crime_scores) if crime_scores else 5.0

        return {
            'distance_meters': distance_meters,
            'estimated_time_minutes': estimated_time_minutes,
            'safety_score': max(1.0, min(10.0, safety_score)),
            'bike_coverage_percent': min(100.0, bike_coverage_percent)
        }

    def _create_error_result(self, request: RouteRequest, error_message: str,
                             start_time: float) -> RouteResult:
        """Create RouteResult for error cases"""
        calculation_time = (time.time() - start_time) * 1000

        return RouteResult(
            route=[], distance_meters=0, estimated_time_minutes=0,
            safety_score=0, bike_coverage_percent=0,
            route_type=request.route_type, algorithm_used=request.algorithm,
            calculation_time_ms=calculation_time, node_count=0,
            error_message=error_message
        )

    def calculate_multiple_routes(self, requests: List[RouteRequest]) -> List[RouteResult]:
        """Calculate multiple routes efficiently"""
        results = []

        for request in requests:
            result = self.calculate_route(request)
            results.append(result)

        return results

    def compare_routes(self, start_lat: float, start_lon: float,
                       end_lat: float, end_lon: float,
                       route_types: Optional[List[str]] = None,
                       algorithm: str = 'dijkstra') -> Dict[str, RouteResult]:
        """
        Compare different route types for the same start/end points.

        Args:
            start_lat, start_lon: Start coordinates
            end_lat, end_lon: End coordinates
            route_types: List of route types to compare (default: all available)
            algorithm: Algorithm to use for all routes

        Returns:
            Dictionary mapping route types to their results
        """
        if route_types is None and self.graph_builder:
            route_types = list(self.graph_builder.weighted_graphs.keys())
        elif route_types is None:
            route_types = []

        requests = []
        for route_type in route_types:
            request = RouteRequest(
                start_lat=start_lat, start_lon=start_lon,
                end_lat=end_lat, end_lon=end_lon,
                route_type=route_type, algorithm=algorithm
            )
            requests.append(request)

        results = self.calculate_multiple_routes(requests)

        # Return as dictionary
        return {req.route_type: result for req, result in zip(requests, results)}

    def get_route_statistics(self) -> Dict:
        """Get overall route calculation statistics"""
        if not self.graph_builder:
            return {'error': 'Route calculator not initialized'}

        stats = {
            'available_route_types': list(self.graph_builder.weighted_graphs.keys()),
            'available_algorithms': list(self.algorithm_config.keys()),
            'spatial_indices_built': len(self.spatial_indices),
            'max_search_distance_km': self.max_search_distance_km,
            'default_speed_kmh': self.default_speed_kmh
        }

        # Add graph statistics
        for route_type, graph in self.graph_builder.weighted_graphs.items():
            if graph is not None:
                stats[f'{route_type}_nodes'] = graph.number_of_nodes()
                stats[f'{route_type}_edges'] = graph.number_of_edges()
            else:
                stats[f'{route_type}_nodes'] = 0
                stats[f'{route_type}_edges'] = 0

        return stats
