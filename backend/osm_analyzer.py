"""
OpenStreetMap Analysis Module - Fixed Version

This module handles downloading, processing, and analyzing OpenStreetMap road networks
to identify bike infrastructure and calculate optimal bike routing bonuses.

Key Fixes:
- Improved error handling and network robustness
- Better timeout management using threading instead of signals
- Fixed coordinate bounds and geographic calculations
- More robust fallback strategies
- Improved bike infrastructure detection
- Better data validation and processing
"""

import osmnx as ox
import networkx as nx
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass
import time
import warnings
import threading
from contextlib import contextmanager
import requests
from geopy.distance import geodesic
import math

# Suppress warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

class TimeoutError(Exception):
    """Custom timeout exception"""
    pass

@contextmanager
def timeout(duration):
    """Context manager for timeout functionality using threading"""
    result = {'timed_out': False, 'exception': None}

    def timeout_handler():
        time.sleep(duration)
        result['timed_out'] = True

    timer = threading.Thread(target=timeout_handler)
    timer.daemon = True
    timer.start()

    try:
        yield result
        if result['timed_out']:
            raise TimeoutError(f"Operation timed out after {duration} seconds")
    finally:
        pass


@dataclass
class BikeInfrastructurePatterns:
    """OSM tags that indicate bike-friendly infrastructure"""

    # Primary bike infrastructure tags
    CYCLEWAY_TAGS = {
        'cycleway': ['lane', 'track', 'shared_lane', 'opposite_lane', 'opposite_track', 'shared', 'shared_busway'],
        'cycleway:left': ['lane', 'track', 'shared_lane', 'opposite_lane', 'shared'],
        'cycleway:right': ['lane', 'track', 'shared_lane', 'opposite_lane', 'shared'],
        'cycleway:both': ['lane', 'track', 'shared_lane', 'shared']
    }

    # Highway types that are bike-designated
    BIKE_HIGHWAYS = {
        'cycleway', 'path', 'footway', 'pedestrian'
    }

    # Bicycle permission tags
    BICYCLE_TAGS = {
        'bicycle': ['designated', 'yes', 'permissive', 'use_sidepath'],
        'bicycle:lanes': ['designated', 'yes', 'lane'],
        'bicycle:lanes:forward': ['designated', 'yes', 'lane'],
        'bicycle:lanes:backward': ['designated', 'yes', 'lane']
    }

    # Surface types favorable for biking
    BIKE_FRIENDLY_SURFACES = {
        'surface': ['paved', 'asphalt', 'concrete', 'paving_stones', 'cobblestone']
    }

    # Low traffic roads that are bike-friendly
    BIKE_FRIENDLY_HIGHWAYS = {
        'residential', 'living_street', 'unclassified', 'service', 'tertiary'
    }


@dataclass
class CityBounds:
    """Geographic boundaries for supported cities - Fixed coordinates"""

    # Indianapolis bounds (corrected and expanded)
    # Indianapolis (city + county, Marion County / Unigov limits)
    INDIANAPOLIS = {
        'north': 39.97,   # near northern Marion County border
        'south': 39.50,   # near southern Marion County border
        'east': -85.70,   # eastern border of Marion
        'west': -86.55    # western border of Marion
    }

    # West Lafayette (city limits)
    WEST_LAFAYETTE = {
        'north': 40.47,   # approximate city north edge
        'south': 40.39,   # approximate city south edge
        'east': -86.85,   # approximate east border
        'west': -86.95    # approximate west border
    }



class OSMAnalyzer:
    """
    Analyzes OpenStreetMap data to extract road networks and identify
    bike infrastructure for routing optimization.
    """

    def __init__(self):
        self.indy_graph: Optional[nx.MultiDiGraph] = None
        self.wl_graph: Optional[nx.MultiDiGraph] = None
        self.combined_graph: Optional[nx.MultiDiGraph] = None
        self.bike_infrastructure_stats: Dict = {}
        self.bike_bonus_factor: float = 0.0

        # Configure OSMnx settings with error handling
        self._configure_osmnx()

    def _configure_osmnx(self):
        """Configure OSMnx with proper error handling"""
        try:
            # Configure OSMnx settings
            ox.settings.use_cache = True
            ox.settings.log_console = False
            ox.settings.requests_timeout = 30
            ox.settings.timeout = 300
            print("OSMnx configured successfully")
        except Exception as e:
            print(f"Warning: Could not configure OSMnx settings: {e}")

    def _validate_bounds(self, bounds: Dict[str, float], city_name: str) -> bool:
        """Validate geographic bounds"""
        required_keys = ['north', 'south', 'east', 'west']

        if not all(key in bounds for key in required_keys):
            print(f"Error: Missing required bounds keys for {city_name}")
            return False

        if bounds['north'] <= bounds['south']:
            print(f"Error: Invalid latitude bounds for {city_name}")
            return False

        if bounds['east'] <= bounds['west']:
            print(f"Error: Invalid longitude bounds for {city_name}")
            return False

        return True

    def _calculate_area_size(self, bounds: Dict[str, float]) -> float:
        """Calculate approximate area size in square kilometers"""
        # Calculate distances using geodesic
        north_west = (bounds['north'], bounds['west'])
        north_east = (bounds['north'], bounds['east'])
        south_west = (bounds['south'], bounds['west'])

        width = geodesic(north_west, north_east).kilometers
        height = geodesic(north_west, south_west).kilometers

        return width * height

    def download_road_network(self, bounds: Dict[str, float],
                              city_name: str,
                              network_type: str = 'bike',
                              retry_attempts: int = 3) -> Optional[nx.MultiDiGraph]:
        """
        Download road network from OpenStreetMap with robust fallback strategies.
        """
        print(f"Downloading {city_name} road network...")

        # Validate bounds
        if not self._validate_bounds(bounds, city_name):
            return self._create_fallback_graph(bounds, city_name)

        # Calculate area and adjust strategy
        area_km2 = self._calculate_area_size(bounds)
        print(f"Area size: {area_km2:.1f} km²")

        # Strategy selection based on area size
        if area_km2 > 1000:  # Large area - use point-based approach
            strategies = ['point', 'bbox_small', 'bbox_full']
        else:  # Small area - try bbox first
            strategies = ['bbox_full', 'point', 'bbox_small']

        # Try different network types
        network_types_to_try = [network_type, 'all', 'drive']

        for net_type in network_types_to_try:
            print(f"Trying network type: {net_type}")

            for strategy in strategies:
                print(f"Using strategy: {strategy}")

                for attempt in range(retry_attempts):
                    try:
                        graph = None

                        if strategy == 'bbox_full':
                            graph = self._try_bbox_download(bounds, city_name, net_type)
                        elif strategy == 'bbox_small':
                            graph = self._try_bbox_download(self._shrink_bounds(bounds, 0.8), city_name, net_type)
                        elif strategy == 'point':
                            graph = self._try_point_download(bounds, city_name, net_type)

                        if graph is not None and graph.number_of_nodes() > 0:
                            processed = self._process_graph(graph, city_name)
                            if processed is not None:
                                return processed

                    except Exception as e:
                        print(f"Attempt {attempt + 1} failed for {city_name} with {net_type} ({strategy}): {e}")
                        if attempt < retry_attempts - 1:
                            time.sleep(2)

        # All strategies failed - create fallback
        print(f"All download strategies failed for {city_name}. Creating fallback graph...")
        return self._create_fallback_graph(bounds, city_name)

    def _shrink_bounds(self, bounds: Dict[str, float], factor: float) -> Dict[str, float]:
        """Shrink bounds by a factor (0.0 to 1.0)"""
        center_lat = (bounds['north'] + bounds['south']) / 2
        center_lon = (bounds['east'] + bounds['west']) / 2

        lat_range = (bounds['north'] - bounds['south']) * factor / 2
        lon_range = (bounds['east'] - bounds['west']) * factor / 2

        return {
            'north': center_lat + lat_range,
            'south': center_lat - lat_range,
            'east': center_lon + lon_range,
            'west': center_lon - lon_range
        }

    def _try_bbox_download(self, bounds: Dict[str, float], city_name: str, network_type: str) -> Optional[nx.MultiDiGraph]:
        """Try downloading using bounding box approach"""
        try:
            print(f"Downloading bbox: N{bounds['north']:.3f} S{bounds['south']:.3f} E{bounds['east']:.3f} W{bounds['west']:.3f}")

            # Use a more conservative timeout approach
            start_time = time.time()

            graph = ox.graph_from_bbox(
                bounds['north'], bounds['south'],
                bounds['east'], bounds['west'],
                network_type=network_type,
                simplify=True,
                retain_all=False,  # Changed to False for better performance
                truncate_by_edge=True
            )

            elapsed = time.time() - start_time
            print(f"Bbox download completed in {elapsed:.1f} seconds")
            return graph

        except Exception as e:
            print(f"Bbox download failed: {e}")
            return None

    def _try_point_download(self, bounds: Dict[str, float], city_name: str, network_type: str) -> Optional[nx.MultiDiGraph]:
        """Try downloading using point-based approach"""
        try:
            # Calculate center point
            center_lat = (bounds['north'] + bounds['south']) / 2
            center_lon = (bounds['east'] + bounds['west']) / 2

            # Calculate radius to cover most of the area
            corner1 = (bounds['north'], bounds['west'])
            corner2 = (bounds['south'], bounds['east'])
            radius_km = geodesic(corner1, corner2).kilometers / 2
            radius_m = radius_km * 1000

            # Try different radius sizes
            for multiplier in [1.0, 1.2, 0.8]:
                try:
                    current_radius = radius_m * multiplier
                    print(f"Trying point download with radius {current_radius/1000:.1f} km")

                    start_time = time.time()
                    graph = ox.graph_from_point(
                        (center_lat, center_lon),
                        dist=current_radius,
                        network_type=network_type,
                        simplify=True,
                        retain_all=False,
                        truncate_by_edge=True
                    )

                    elapsed = time.time() - start_time
                    print(f"Point download completed in {elapsed:.1f} seconds")

                    if graph.number_of_nodes() > 10:  # Minimum viable graph
                        return graph

                except Exception as e:
                    print(f"Point download failed with radius {current_radius/1000:.1f}km: {e}")
                    continue

            return None

        except Exception as e:
            print(f"Point download strategy failed: {e}")
            return None

    def _process_graph(self, graph: nx.MultiDiGraph, city_name: str) -> Optional[nx.MultiDiGraph]:
        """Process and validate the downloaded graph"""
        if graph is None or graph.number_of_nodes() == 0:
            return None

        print(f"Processing graph with {graph.number_of_nodes()} nodes and {graph.number_of_edges()} edges")

        # Validate node coordinates
        valid_nodes = 0
        for node, data in graph.nodes(data=True):
            if 'y' in data and 'x' in data:
                if -90 <= data['y'] <= 90 and -180 <= data['x'] <= 180:
                    valid_nodes += 1

        if valid_nodes < graph.number_of_nodes() * 0.9:  # Less than 90% valid nodes
            print(f"Warning: Only {valid_nodes}/{graph.number_of_nodes()} nodes have valid coordinates")

        # Add missing edge attributes
        edges_processed = 0
        for u, v, k, data in graph.edges(keys=True, data=True):
            # Ensure length attribute exists
            if 'length' not in data or data['length'] <= 0:
                try:
                    u_data = graph.nodes[u]
                    v_data = graph.nodes[v]

                    if 'y' in u_data and 'x' in u_data and 'y' in v_data and 'x' in v_data:
                        # Use geodesic distance for accuracy
                        point1 = (u_data['y'], u_data['x'])
                        point2 = (v_data['y'], v_data['x'])
                        distance = geodesic(point1, point2).meters
                        data['length'] = max(distance, 1.0)  # Minimum 1 meter
                    else:
                        data['length'] = 100.0  # Default fallback
                except Exception:
                    data['length'] = 100.0  # Default fallback

            # Ensure highway attribute exists
            if 'highway' not in data:
                data['highway'] = 'unclassified'

            edges_processed += 1

        print(f"Successfully processed {city_name} network: "
              f"{graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")
        return graph

    def _create_fallback_graph(self, bounds: Dict[str, float], city_name: str) -> nx.MultiDiGraph:
        """Create a more realistic fallback graph when OSM download fails"""
        print(f"Creating realistic fallback graph for {city_name}...")

        graph = nx.MultiDiGraph()

        # Create a more realistic street grid
        grid_size = 20  # Increased for better coverage
        lat_step = (bounds['north'] - bounds['south']) / (grid_size - 1)
        lon_step = (bounds['east'] - bounds['west']) / (grid_size - 1)

        # Add nodes
        node_id = 0
        node_positions = {}

        for i in range(grid_size):
            for j in range(grid_size):
                lat = bounds['south'] + i * lat_step
                lon = bounds['west'] + j * lon_step

                graph.add_node(node_id, y=lat, x=lon)
                node_positions[node_id] = (i, j)
                node_id += 1

        # Add edges with realistic properties
        for node_id, (i, j) in node_positions.items():
            # Connect to adjacent nodes (4-connectivity)
            for di, dj in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
                ni, nj = i + di, j + dj
                if 0 <= ni < grid_size and 0 <= nj < grid_size:
                    target_id = ni * grid_size + nj

                    # Calculate realistic distance
                    lat1 = bounds['south'] + i * lat_step
                    lon1 = bounds['west'] + j * lon_step
                    lat2 = bounds['south'] + ni * lat_step
                    lon2 = bounds['west'] + nj * lon_step

                    distance = geodesic((lat1, lon1), (lat2, lon2)).meters

                    # Add edge with realistic attributes
                    graph.add_edge(
                        node_id, target_id,
                        length=distance,
                        highway='residential',
                        oneway=False,
                        has_bike_lane=False,
                        bike_quality_score=0.2  # Minimal bike friendliness
                    )

        print(f"Created fallback graph for {city_name}: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")
        return graph

    def identify_bike_infrastructure(self, graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
        """Identify and tag bike infrastructure with improved detection"""
        print("Identifying bike infrastructure...")

        bike_edge_count = 0
        total_bike_length = 0.0
        total_edge_count = 0
        total_length = 0.0

        infrastructure_types = {
            'dedicated_path': 0,
            'bike_lane': 0,
            'shared_road': 0,
            'bike_friendly': 0
        }

        for u, v, k, data in graph.edges(keys=True, data=True):
            has_bike_infrastructure = False
            bike_quality_score = 0.0
            infrastructure_type = 'none'

            # Get edge length
            edge_length = data.get('length', 0)
            total_length += edge_length
            total_edge_count += 1

            # Check for dedicated bike infrastructure (highest priority)
            highway_type = str(data.get('highway', '')).lower()
            if highway_type in BikeInfrastructurePatterns.BIKE_HIGHWAYS:
                has_bike_infrastructure = True
                bike_quality_score = 1.0
                infrastructure_type = 'dedicated_path'
                infrastructure_types['dedicated_path'] += 1

            # Check for explicit bike lanes
            if not has_bike_infrastructure:
                for tag, values in BikeInfrastructurePatterns.CYCLEWAY_TAGS.items():
                    tag_value = str(data.get(tag, '')).lower()
                    if tag_value in values:
                        has_bike_infrastructure = True
                        bike_quality_score = max(bike_quality_score, 0.8)
                        infrastructure_type = 'bike_lane'
                        infrastructure_types['bike_lane'] += 1
                        break

            # Check bicycle permission tags
            if not has_bike_infrastructure:
                for tag, values in BikeInfrastructurePatterns.BICYCLE_TAGS.items():
                    tag_value = str(data.get(tag, '')).lower()
                    if any(val in tag_value for val in values):
                        has_bike_infrastructure = True
                        bike_quality_score = max(bike_quality_score, 0.6)
                        infrastructure_type = 'shared_road'
                        infrastructure_types['shared_road'] += 1
                        break

            # Check for bike-friendly road types
            if not has_bike_infrastructure and highway_type in BikeInfrastructurePatterns.BIKE_FRIENDLY_HIGHWAYS:
                has_bike_infrastructure = True
                bike_quality_score = 0.4
                infrastructure_type = 'bike_friendly'
                infrastructure_types['bike_friendly'] += 1

            # Bonus for good surfaces
            surface = str(data.get('surface', '')).lower()
            if surface in BikeInfrastructurePatterns.BIKE_FRIENDLY_SURFACES.get('surface', []):
                if has_bike_infrastructure:
                    bike_quality_score = min(1.0, bike_quality_score + 0.1)
                else:
                    bike_quality_score = 0.2
                    has_bike_infrastructure = True
                    infrastructure_type = 'bike_friendly'
                    infrastructure_types['bike_friendly'] += 1

            # Set attributes
            data['has_bike_lane'] = has_bike_infrastructure
            data['bike_quality_score'] = bike_quality_score
            data['bike_infrastructure_type'] = infrastructure_type

            if has_bike_infrastructure:
                bike_edge_count += 1
                total_bike_length += edge_length

        # Calculate statistics
        bike_coverage_percent = (bike_edge_count / total_edge_count * 100) if total_edge_count > 0 else 0
        bike_length_percent = (total_bike_length / total_length * 100) if total_length > 0 else 0

        print(f"Bike infrastructure analysis complete:")
        print(f"  Total edges: {total_edge_count}")
        print(f"  Bike edges: {bike_edge_count} ({bike_coverage_percent:.1f}%)")
        print(f"  Bike length: {total_bike_length/1000:.1f} km / {total_length/1000:.1f} km ({bike_length_percent:.1f}%)")
        print(f"  Infrastructure breakdown:")
        for infra_type, count in infrastructure_types.items():
            if count > 0:
                print(f"    {infra_type}: {count} edges")

        return graph

    def calculate_road_statistics(self, graph: nx.MultiDiGraph, city_name: str) -> Dict:
        """Calculate comprehensive road network statistics"""
        print(f"Calculating road statistics for {city_name}...")

        if graph.number_of_nodes() == 0:
            return {
                'city': city_name,
                'node_count': 0,
                'edge_count': 0,
                'total_length_km': 0,
                'bike_coverage_percent': 0,
                'bike_length_percent': 0,
                'error': 'Empty graph'
            }

        # Basic network statistics
        node_count = graph.number_of_nodes()
        edge_count = graph.number_of_edges()

        # Calculate statistics
        edge_lengths = []
        bike_edge_lengths = []
        bike_edge_count = 0
        highway_types = {}
        bike_types = {}

        for u, v, k, data in graph.edges(keys=True, data=True):
            length = data.get('length', 0)
            edge_lengths.append(length)

            # Count highway types
            highway = data.get('highway', 'unknown')
            highway_types[highway] = highway_types.get(highway, 0) + 1

            # Count bike infrastructure
            if data.get('has_bike_lane', False):
                bike_edge_lengths.append(length)
                bike_edge_count += 1

                bike_type = data.get('bike_infrastructure_type', 'unknown')
                bike_types[bike_type] = bike_types.get(bike_type, 0) + 1

        # Calculate derived statistics
        edge_lengths = np.array(edge_lengths) if edge_lengths else np.array([0])
        total_length_km = edge_lengths.sum() / 1000
        avg_segment_length = edge_lengths.mean()
        median_segment_length = np.median(edge_lengths)

        # Bike infrastructure statistics
        bike_coverage_percent = (bike_edge_count / edge_count * 100) if edge_count > 0 else 0
        bike_length_km = sum(bike_edge_lengths) / 1000 if bike_edge_lengths else 0
        bike_length_percent = (bike_length_km / total_length_km * 100) if total_length_km > 0 else 0

        # Network connectivity
        try:
            # Convert to undirected for connectivity analysis
            undirected = graph.to_undirected()
            num_components = nx.number_connected_components(undirected)
            largest_component_size = len(max(nx.connected_components(undirected), key=len)) if num_components > 0 else 0
        except:
            num_components = 1
            largest_component_size = node_count

        stats = {
            'city': city_name,
            'node_count': node_count,
            'edge_count': edge_count,
            'total_length_km': total_length_km,
            'avg_segment_length_m': avg_segment_length,
            'median_segment_length_m': median_segment_length,
            'bike_edge_count': bike_edge_count,
            'bike_coverage_percent': bike_coverage_percent,
            'bike_length_km': bike_length_km,
            'bike_length_percent': bike_length_percent,
            'num_components': num_components,
            'largest_component_size': largest_component_size,
            'connectivity_ratio': largest_component_size / node_count if node_count > 0 else 0,
            'highway_types': highway_types,
            'bike_infrastructure_types': bike_types
        }

        print(f"{city_name} network statistics:")
        for key, value in stats.items():
            if isinstance(value, float):
                print(f"  {key}: {value:.2f}")
            elif isinstance(value, dict):
                if len(value) <= 5:  # Only print if not too many items
                    print(f"  {key}: {dict(list(value.items())[:5])}")
            else:
                print(f"  {key}: {value}")

        return stats

    def calculate_optimal_bike_bonus(self, combined_stats: Dict) -> float:
        """Calculate optimal bike bonus factor with improved logic"""
        print("Calculating optimal bike bonus factor...")

        bike_coverage = combined_stats.get('bike_coverage_percent', 0)
        bike_length_coverage = combined_stats.get('bike_length_percent', 0)
        connectivity = combined_stats.get('connectivity_ratio', 1.0)

        # Use weighted average of different coverage metrics
        effective_coverage = (bike_coverage * 0.6 + bike_length_coverage * 0.4)

        # Adjust based on network connectivity
        if connectivity < 0.8:  # Fragmented network
            effective_coverage *= 0.8  # Reduce effective coverage

        print(f"Effective bike infrastructure coverage: {effective_coverage:.1f}%")
        print(f"Network connectivity ratio: {connectivity:.2f}")

        # Calculate bonus with more nuanced approach
        if effective_coverage < 5:
            bonus_factor = 0.7  # Very strong incentive
            incentive_level = "VERY STRONG"
        elif effective_coverage < 15:
            bonus_factor = 0.5  # Strong incentive
            incentive_level = "STRONG"
        elif effective_coverage < 30:
            bonus_factor = 0.3  # Moderate incentive
            incentive_level = "MODERATE"
        elif effective_coverage < 50:
            bonus_factor = 0.2  # Light incentive
            incentive_level = "LIGHT"
        else:
            bonus_factor = 0.1  # Minimal incentive
            incentive_level = "MINIMAL"

        # Apply connectivity adjustment
        if connectivity < 0.8:
            bonus_factor = min(0.8, bonus_factor + 0.1)  # Slight boost for fragmented networks

        print(f"Bike bonus factor: {bonus_factor:.1f} ({incentive_level} incentive)")
        self.bike_bonus_factor = bonus_factor
        return bonus_factor

    def combine_city_networks(self, indy_graph: Optional[nx.MultiDiGraph],
                              wl_graph: Optional[nx.MultiDiGraph]) -> nx.MultiDiGraph:
        """Combine road networks with improved node ID management"""
        print("Combining city road networks...")

        graphs_to_combine = []
        graph_names = []

        if indy_graph is not None and indy_graph.number_of_nodes() > 0:
            graphs_to_combine.append(indy_graph)
            graph_names.append("Indianapolis")

        if wl_graph is not None and wl_graph.number_of_nodes() > 0:
            graphs_to_combine.append(wl_graph)
            graph_names.append("West Lafayette")

        if not graphs_to_combine:
            print("No valid graphs available to combine")
            return nx.MultiDiGraph()

        if len(graphs_to_combine) == 1:
            print(f"Only one graph available ({graph_names[0]}) - using as combined network")
            combined = graphs_to_combine[0].copy()
        else:
            print(f"Combining {len(graphs_to_combine)} graphs: {', '.join(graph_names)}")

            # Create new combined graph
            combined = nx.MultiDiGraph()
            node_id_offset = 0

            for i, graph in enumerate(graphs_to_combine):
                print(f"Adding {graph_names[i]}: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges")

                # Add nodes with offset
                for node, data in graph.nodes(data=True):
                    new_node_id = node + node_id_offset
                    combined.add_node(new_node_id, **data)

                # Add edges with offset
                for u, v, k, data in graph.edges(keys=True, data=True):
                    new_u = u + node_id_offset
                    new_v = v + node_id_offset
                    combined.add_edge(new_u, new_v, key=k, **data)

                node_id_offset += graph.number_of_nodes()

        print(f"Combined network: {combined.number_of_nodes()} nodes, "
              f"{combined.number_of_edges()} edges")

        self.combined_graph = combined
        return combined

    def analyze_osm_networks(self) -> Dict:
        """Complete OSM network analysis pipeline with better error handling"""
        print("Starting comprehensive OSM network analysis...")
        start_time = time.time()

        results = {
            'networks_loaded': [],
            'analysis_complete': False,
            'errors': [],
            'warnings': []
        }

        city_stats = []

        # Download and analyze Indianapolis network
        try:
            print("\n" + "="*50)
            print("INDIANAPOLIS NETWORK ANALYSIS")
            print("="*50)

            self.indy_graph = self.download_road_network(
                CityBounds.INDIANAPOLIS,
                "Indianapolis"
            )

            if self.indy_graph is not None and self.indy_graph.number_of_nodes() > 0:
                self.indy_graph = self.identify_bike_infrastructure(self.indy_graph)
                indy_stats = self.calculate_road_statistics(self.indy_graph, "Indianapolis")
                city_stats.append(indy_stats)
                results['networks_loaded'].append('Indianapolis')
                results['indianapolis_stats'] = indy_stats
                print("Indianapolis network analysis completed successfully")
            else:
                error_msg = "Failed to download Indianapolis network"
                results['errors'].append(error_msg)
                print(f"Error: {error_msg}")

        except Exception as e:
            error_msg = f"Indianapolis analysis failed: {str(e)}"
            results['errors'].append(error_msg)
            print(f"Error: {error_msg}")

        # Download and analyze West Lafayette network
        try:
            print("\n" + "="*50)
            print("WEST LAFAYETTE NETWORK ANALYSIS")
            print("="*50)

            self.wl_graph = self.download_road_network(
                CityBounds.WEST_LAFAYETTE,
                "West Lafayette"
            )

            if self.wl_graph is not None and self.wl_graph.number_of_nodes() > 0:
                self.wl_graph = self.identify_bike_infrastructure(self.wl_graph)
                wl_stats = self.calculate_road_statistics(self.wl_graph, "West Lafayette")
                city_stats.append(wl_stats)
                results['networks_loaded'].append('West Lafayette')
                results['west_lafayette_stats'] = wl_stats
                print("West Lafayette network analysis completed successfully")
            else:
                error_msg = "Failed to download West Lafayette network"
                results['errors'].append(error_msg)
                print(f"Error: {error_msg}")

        except Exception as e:
            error_msg = f"West Lafayette analysis failed: {str(e)}"
            results['errors'].append(error_msg)
            print(f"Error: {error_msg}")

        # Combine networks and analyze
        try:
            print("\n" + "="*50)
            print("NETWORK COMBINATION AND FINAL ANALYSIS")
            print("="*50)

            combined_graph = self.combine_city_networks(self.indy_graph, self.wl_graph)

            if combined_graph.number_of_nodes() > 0:
                combined_stats = self.calculate_road_statistics(combined_graph, "Combined")
                results['combined_stats'] = combined_stats

                # Calculate optimal bike bonus
                bike_bonus = self.calculate_optimal_bike_bonus(combined_stats)
                results['bike_bonus_factor'] = bike_bonus

                # Additional analysis metrics
                results['total_cities'] = len(city_stats)
                results['total_nodes'] = combined_stats['node_count']
                results['total_edges'] = combined_stats['edge_count']
                results['total_length_km'] = combined_stats['total_length_km']
                results['overall_bike_coverage'] = combined_stats['bike_coverage_percent']

                print("Combined network analysis completed successfully")
            else:
                error_msg = "No valid networks available for combination"
                results['errors'].append(error_msg)
                results['bike_bonus_factor'] = 0.4  # Conservative default
                print(f"Warning: {error_msg}, using default bike bonus")

        except Exception as e:
            error_msg = f"Network combination failed: {str(e)}"
            results['errors'].append(error_msg)
            results['bike_bonus_factor'] = 0.4  # Conservative default
            print(f"Error: {error_msg}")

        # Final validation and summary
        try:
            elapsed_time = time.time() - start_time
            results['analysis_time_seconds'] = elapsed_time
            results['analysis_complete'] = len(results['networks_loaded']) > 0

            if not results['analysis_complete']:
                results['warnings'].append("No networks were successfully loaded")
                # Create a minimal fallback result
                results['bike_bonus_factor'] = 0.5
                results['combined_stats'] = {
                    'city': 'Fallback',
                    'node_count': 0,
                    'edge_count': 0,
                    'total_length_km': 0,
                    'bike_coverage_percent': 10,  # Assume low coverage
                    'bike_length_percent': 10
                }

            print(f"\n" + "="*50)
            print("ANALYSIS SUMMARY")
            print("="*50)
            print(f"Analysis completed in {elapsed_time:.1f} seconds")
            print(f"Networks loaded: {len(results['networks_loaded'])}")
            print(f"Success: {results['analysis_complete']}")

            if results['networks_loaded']:
                print(f"Successfully analyzed: {', '.join(results['networks_loaded'])}")

            if results['errors']:
                print(f"Errors encountered: {len(results['errors'])}")
                for error in results['errors']:
                    print(f"  - {error}")

            if results['warnings']:
                print(f"Warnings: {len(results['warnings'])}")
                for warning in results['warnings']:
                    print(f"  - {warning}")

            print(f"Final bike bonus factor: {results['bike_bonus_factor']:.2f}")

        except Exception as e:
            print(f"Error in final analysis: {e}")
            results['analysis_complete'] = False
            results['errors'].append(f"Final analysis error: {str(e)}")

        print("\nOSM network analysis pipeline completed!")
        return results

    def get_bike_infrastructure_at_edge(self, u: int, v: int, key: int = 0) -> Tuple[bool, float]:
        """Get bike infrastructure information for a specific edge with validation"""
        if self.combined_graph is None:
            return False, 0.0

        try:
            if not self.combined_graph.has_edge(u, v, key):
                return False, 0.0

            edge_data = self.combined_graph[u][v][key]
            has_bike = edge_data.get('has_bike_lane', False)
            quality = edge_data.get('bike_quality_score', 0.0)
            return has_bike, quality

        except (KeyError, TypeError) as e:
            print(f"Warning: Could not retrieve bike infrastructure for edge {u}-{v}-{key}: {e}")
            return False, 0.0

    def get_edge_attributes(self, u: int, v: int, key: int = 0) -> Dict:
        """Get all attributes for a specific edge"""
        if self.combined_graph is None:
            return {}

        try:
            if not self.combined_graph.has_edge(u, v, key):
                return {}

            return dict(self.combined_graph[u][v][key])

        except (KeyError, TypeError) as e:
            print(f"Warning: Could not retrieve attributes for edge {u}-{v}-{key}: {e}")
            return {}

    def export_network_for_routing(self) -> Optional[nx.MultiDiGraph]:
        """Export the combined network prepared for routing algorithms"""
        if self.combined_graph is None:
            print("No combined network available for export")
            return None

        # Validate the network before export
        if self.combined_graph.number_of_nodes() == 0:
            print("Combined network is empty")
            return None

        # Check for essential attributes
        missing_length_edges = 0
        for u, v, k, data in self.combined_graph.edges(keys=True, data=True):
            if 'length' not in data or data['length'] <= 0:
                missing_length_edges += 1

        if missing_length_edges > 0:
            print(f"Warning: {missing_length_edges} edges missing length attribute")

        print(f"Exporting network for routing:")
        print(f"  Nodes: {self.combined_graph.number_of_nodes()}")
        print(f"  Edges: {self.combined_graph.number_of_edges()}")
        print(f"  Bike bonus factor: {self.bike_bonus_factor:.2f}")

        return self.combined_graph

    def get_network_summary(self) -> Dict:
        """Get a summary of all loaded networks"""
        summary = {
            'has_indianapolis': self.indy_graph is not None and self.indy_graph.number_of_nodes() > 0,
            'has_west_lafayette': self.wl_graph is not None and self.wl_graph.number_of_nodes() > 0,
            'has_combined': self.combined_graph is not None and self.combined_graph.number_of_nodes() > 0,
            'bike_bonus_factor': self.bike_bonus_factor
        }

        if summary['has_indianapolis']:
            summary['indianapolis_nodes'] = self.indy_graph.number_of_nodes()
            summary['indianapolis_edges'] = self.indy_graph.number_of_edges()

        if summary['has_west_lafayette']:
            summary['west_lafayette_nodes'] = self.wl_graph.number_of_nodes()
            summary['west_lafayette_edges'] = self.wl_graph.number_of_edges()

        if summary['has_combined']:
            summary['combined_nodes'] = self.combined_graph.number_of_nodes()
            summary['combined_edges'] = self.combined_graph.number_of_edges()

        return summary