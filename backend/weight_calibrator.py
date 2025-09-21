"""
Weight Calibration System

This module coordinates crime data analysis and OSM network analysis to calculate
optimal weights for the four different routing algorithms. It ensures that route
types produce meaningfully different paths with appropriate penalties and bonuses.

Key Components:
- Master calibration function coordinating all analysis
- Route differentiation testing to verify meaningful differences
- Final weight constant calculation and export
- Validation of routing algorithm effectiveness
"""

import numpy as np
import networkx as nx
import json
import pickle
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass, asdict
from pathlib import Path
import random

try:
    from crime_analyzer import CrimeDataAnalyzer
    from osm_analyzer import OSMAnalyzer
except ImportError:
    from .crime_analyzer import CrimeDataAnalyzer
    from .osm_analyzer import OSMAnalyzer


@dataclass
class CalibratedWeights:
    """Container for all calibrated routing weights and parameters"""
    
    # Base weights
    CRIME_WEIGHT_MULTIPLIER: float
    BIKE_BONUS_FACTOR: float
    
    # Crime type severity weights
    CRIME_TYPE_WEIGHTS: Dict[str, float]
    
    # Route-specific multipliers for fine-tuning
    ROUTE_MULTIPLIERS: Dict[str, Dict[str, float]]
    
    # Analysis metadata
    calibration_stats: Dict
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'CalibratedWeights':
        """Create from dictionary"""
        return cls(**data)


class WeightCalibrator:
    """
    Coordinates crime and OSM analysis to calculate optimal routing weights
    that create meaningfully different route options.
    """
    
    def __init__(self):
        self.crime_analyzer: Optional[CrimeDataAnalyzer] = None
        self.osm_analyzer: Optional[OSMAnalyzer] = None
        self.calibrated_weights: Optional[CalibratedWeights] = None
        
        # Test points for route differentiation validation
        # Format: (start_lat, start_lon, end_lat, end_lon, description)
        self.test_routes = [
            # Indianapolis test routes
            (39.7684, -86.1581, 39.7391, -86.1477, "Indianapolis Downtown to Fountain Square"),
            (39.8283, -86.1752, 39.7589, -86.1869, "Indianapolis North to Airport Area"),
            (39.7730, -86.1470, 39.8014, -86.0751, "Indianapolis Center to East Side"),
            
            # West Lafayette test routes  
            (40.4237, -86.9212, 40.4459, -86.9071, "Purdue Campus to North Lafayette"),
            (40.4114, -86.9298, 40.4347, -86.9140, "South Campus to Downtown WL"),
            
            # Cross-city routes (if both networks connected)
            (39.7684, -86.1581, 40.4237, -86.9212, "Indianapolis to West Lafayette")
        ]
    
    def master_calibration(self, indy_csv_path: str, wl_json_path: str) -> CalibratedWeights:
        """
        Master calibration function that coordinates all analysis components.
        
        Args:
            indy_csv_path: Path to Indianapolis crime CSV
            wl_json_path: Path to West Lafayette crime JSON
            
        Returns:
            CalibratedWeights object with all optimized parameters
        """
        print("=" * 60)
        print("STARTING MASTER CALIBRATION PROCESS")
        print("=" * 60)
        
        # Initialize analyzers
        self.crime_analyzer = CrimeDataAnalyzer()
        self.osm_analyzer = OSMAnalyzer()
        
        print("\n1. CRIME DATA ANALYSIS")
        print("-" * 30)
        crime_results = self.crime_analyzer.analyze_crime_data(indy_csv_path, wl_json_path)
        
        print("\n2. OSM NETWORK ANALYSIS") 
        print("-" * 30)
        osm_results = self.osm_analyzer.analyze_osm_networks()
        
        print("\n3. WEIGHT CALCULATION")
        print("-" * 30)
        base_weights = self._calculate_base_weights(crime_results, osm_results)
        
        print("\n4. ROUTE DIFFERENTIATION TESTING")
        print("-" * 30)
        route_multipliers = self._test_route_differentiation(base_weights)
        
        print("\n5. FINAL CALIBRATION")
        print("-" * 30)
        final_weights = self._finalize_weights(base_weights, route_multipliers, crime_results, osm_results)
        
        print("\n6. VALIDATION")
        print("-" * 30)
        validation_results = self._validate_calibration(final_weights)
        
        # Create calibrated weights object
        self.calibrated_weights = CalibratedWeights(
            CRIME_WEIGHT_MULTIPLIER=final_weights['crime_multiplier'],
            BIKE_BONUS_FACTOR=final_weights['bike_bonus'],
            CRIME_TYPE_WEIGHTS=final_weights['crime_type_weights'],
            ROUTE_MULTIPLIERS=final_weights['route_multipliers'],
            calibration_stats={
                'crime_analysis': crime_results,
                'osm_analysis': osm_results,
                'validation_results': validation_results,
                'base_weights': base_weights
            }
        )
        
        print("\n" + "=" * 60)
        print("MASTER CALIBRATION COMPLETE")
        print("=" * 60)
        
        return self.calibrated_weights
    
    def _calculate_base_weights(self, crime_results: Dict, osm_results: Dict) -> Dict:
        """
        Calculate base weights from crime and OSM analysis results.
        
        Args:
            crime_results: Results from crime data analysis
            osm_results: Results from OSM network analysis
            
        Returns:
            Dictionary containing base weight values
        """
        print("Calculating base weights from analysis results...")
        
        # Get base values from analyzers
        crime_multiplier = crime_results.get('crime_weight_multiplier', 1000.0)
        bike_bonus = osm_results.get('bike_bonus_factor', 0.3)
        crime_type_weights = crime_results.get('crime_type_weights', {})
        
        # Validate and adjust if needed
        if crime_multiplier < 100 or crime_multiplier > 20000:
            print(f"Adjusting crime multiplier from {crime_multiplier} to reasonable range")
            crime_multiplier = max(100, min(20000, crime_multiplier))
        
        if bike_bonus < 0.1 or bike_bonus > 0.8:
            print(f"Adjusting bike bonus from {bike_bonus} to reasonable range")  
            bike_bonus = max(0.1, min(0.8, bike_bonus))
        
        base_weights = {
            'crime_multiplier': crime_multiplier,
            'bike_bonus': bike_bonus,
            'crime_type_weights': crime_type_weights
        }
        
        print(f"Base crime multiplier: {crime_multiplier:.1f}")
        print(f"Base bike bonus factor: {bike_bonus:.2f}")
        print(f"Crime type weights: {len(crime_type_weights)} types mapped")
        
        return base_weights
    
    def _test_route_differentiation(self, base_weights: Dict) -> Dict:
        """
        Test routing algorithms to ensure they produce meaningfully different results.
        
        Args:
            base_weights: Base weight values to test
            
        Returns:
            Dictionary of route-specific multipliers for fine-tuning
        """
        print("Testing route differentiation...")
        
        if (self.osm_analyzer is None or 
            self.osm_analyzer.combined_graph is None or 
            self.osm_analyzer.combined_graph.number_of_nodes() == 0):
            print("No network available for route testing - using default multipliers")
            return self._get_default_route_multipliers()
        
        graph = self.osm_analyzer.combined_graph
        print(f"Testing on network with {graph.number_of_nodes()} nodes")
        
        # Test subset of routes (limit for performance)
        test_routes = self.test_routes[:4]  # Test first 4 routes
        route_differences = []
        
        for start_lat, start_lon, end_lat, end_lon, description in test_routes:
            print(f"\nTesting: {description}")
            
            # Find nearest nodes
            start_node = self._find_nearest_node(graph, start_lat, start_lon)
            end_node = self._find_nearest_node(graph, end_lat, end_lon)
            
            if start_node is None or end_node is None:
                print(f"Could not find nodes for {description} - skipping")
                continue
            
            # Calculate routes for all 4 types
            routes = self._calculate_test_routes(
                graph, start_node, end_node, base_weights
            )
            
            # Analyze differences
            differences = self._analyze_route_differences(routes)
            route_differences.append(differences)
            
            print(f"Route length differences: {differences}")
        
        # Calculate adjustment multipliers based on results
        multipliers = self._calculate_route_multipliers(route_differences)
        
        print(f"\nCalculated route multipliers: {multipliers}")
        return multipliers
    
    def _find_nearest_node(self, graph: nx.MultiDiGraph, lat: float, lon: float, 
                          max_distance: float = 0.01) -> Optional[int]:
        """Find nearest graph node to given coordinates"""
        min_distance = float('inf')
        nearest_node = None
        
        for node, data in graph.nodes(data=True):
            node_lat = data.get('y', 0)
            node_lon = data.get('x', 0) 
            
            # Calculate approximate distance
            distance = ((lat - node_lat) ** 2 + (lon - node_lon) ** 2) ** 0.5
            
            if distance < min_distance and distance < max_distance:
                min_distance = distance
                nearest_node = node
        
        return nearest_node
    
    def _calculate_test_routes(self, graph: nx.MultiDiGraph, start: int, end: int, 
                              base_weights: Dict) -> Dict:
        """Calculate routes for all 4 routing types"""
        routes = {}
        
        # Prepare edge weights for each route type
        weight_configs = {
            'fastest': {'use_crime': False, 'use_bike': False},
            'safe': {'use_crime': True, 'use_bike': False},
            'bike': {'use_crime': False, 'use_bike': True},
            'safe_bike': {'use_crime': True, 'use_bike': True}
        }
        
        for route_type, config in weight_configs.items():
            try:
                # Create weighted graph for this route type
                weighted_graph = self._create_weighted_graph(graph, base_weights, config)
                
                # Calculate shortest path
                try:
                    path = nx.shortest_path(weighted_graph, start, end, weight='weight')
                    path_length = nx.shortest_path_length(weighted_graph, start, end, weight='weight')
                    
                    routes[route_type] = {
                        'path': path,
                        'length': path_length,
                        'node_count': len(path)
                    }
                except nx.NetworkXNoPath:
                    print(f"No path found for {route_type} route")
                    routes[route_type] = None
                    
            except Exception as e:
                print(f"Error calculating {route_type} route: {e}")
                routes[route_type] = None
        
        return routes
    
    def _create_weighted_graph(self, graph: nx.MultiDiGraph, base_weights: Dict, 
                              config: Dict) -> nx.MultiDiGraph:
        """Create weighted graph for specific routing configuration"""
        weighted_graph = graph.copy()
        
        crime_multiplier = base_weights['crime_multiplier']
        bike_bonus = base_weights['bike_bonus']
        
        for u, v, k, data in weighted_graph.edges(keys=True, data=True):
            base_length = data.get('length', 100)  # Default 100m if missing
            weight = base_length
            
            # Add crime penalty if enabled
            if config['use_crime'] and self.crime_analyzer is not None:
                # Get edge midpoint coordinates
                u_data = weighted_graph.nodes[u]
                v_data = weighted_graph.nodes[v]
                mid_lat = (u_data.get('y', 0) + v_data.get('y', 0)) / 2
                mid_lon = (u_data.get('x', 0) + v_data.get('x', 0)) / 2
                
                # Get crime density at midpoint
                crime_density = self.crime_analyzer.get_crime_density_at_point(mid_lat, mid_lon)
                
                # Apply crime penalty (assuming average crime severity)
                crime_penalty = crime_density * crime_multiplier * 0.6  # Average severity
                weight += crime_penalty
            
            # Apply bike bonus if enabled
            if config['use_bike'] and data.get('has_bike_lane', False):
                bike_reduction = base_length * bike_bonus
                weight = max(base_length * 0.1, weight - bike_reduction)  # Don't go below 10% of base
            
            data['weight'] = weight
        
        return weighted_graph
    
    def _analyze_route_differences(self, routes: Dict) -> Dict:
        """Analyze differences between route types"""
        valid_routes = {k: v for k, v in routes.items() if v is not None}
        
        if len(valid_routes) < 2:
            return {
                'sufficient_difference': False, 
                'max_difference_percent': 0,
                'valid_route_count': len(valid_routes),
                'route_lengths': {},
                'min_length': 0,
                'max_length': 0
            }
        
        # Get route lengths
        lengths = {k: v['length'] for k, v in valid_routes.items()}
        min_length = min(lengths.values())
        max_length = max(lengths.values())
        
        # Calculate percentage difference
        max_difference_percent = ((max_length - min_length) / min_length * 100) if min_length > 0 else 0
        
        # Check if difference is meaningful (target: 10-50%)
        sufficient_difference = 10 <= max_difference_percent <= 200
        
        return {
            'route_lengths': lengths,
            'min_length': min_length,
            'max_length': max_length,
            'max_difference_percent': max_difference_percent,
            'sufficient_difference': sufficient_difference,
            'valid_route_count': len(valid_routes)
        }
    
    def _calculate_route_multipliers(self, route_differences: List[Dict]) -> Dict:
        """Calculate adjustment multipliers based on route difference analysis"""
        
        if not route_differences:
            print("No route differences provided - using default multipliers")
            return self._get_default_route_multipliers()
        
        # Analyze overall differentiation performance with error handling
        valid_tests = []
        for diff in route_differences:
            try:
                if isinstance(diff, dict) and 'valid_route_count' in diff and diff['valid_route_count'] >= 2:
                    valid_tests.append(diff)
            except (KeyError, TypeError) as e:
                print(f"Warning: Invalid route difference data: {e}")
                continue
        
        if not valid_tests:
            print("No valid route tests - using default multipliers")
            return self._get_default_route_multipliers()
        
        try:
            avg_difference = np.mean([diff['max_difference_percent'] for diff in valid_tests])
            sufficient_count = sum(1 for diff in valid_tests if diff.get('sufficient_difference', False))
            
            print(f"Average route difference: {avg_difference:.1f}%")
            print(f"Sufficient differentiation: {sufficient_count}/{len(valid_tests)} tests")
        except (KeyError, TypeError, ValueError) as e:
            print(f"Error calculating route statistics: {e}")
            return self._get_default_route_multipliers()
        
        # Calculate multipliers based on performance
        multipliers = self._get_default_route_multipliers()
        
        # Adjust multipliers if differentiation is insufficient
        if avg_difference < 10:
            print("Insufficient route differentiation - increasing penalty/bonus factors")
            multipliers['safe']['crime_multiplier'] *= 1.5
            multipliers['bike']['bike_bonus'] *= 1.3
            multipliers['safe_bike']['crime_multiplier'] *= 1.3
            multipliers['safe_bike']['bike_bonus'] *= 1.2
        elif avg_difference > 100:
            print("Excessive route differentiation - reducing penalty/bonus factors")
            multipliers['safe']['crime_multiplier'] *= 0.8
            multipliers['bike']['bike_bonus'] *= 0.9
            multipliers['safe_bike']['crime_multiplier'] *= 0.9
            multipliers['safe_bike']['bike_bonus'] *= 0.95
        
        return multipliers
    
    def _get_default_route_multipliers(self) -> Dict:
        """Get default route-specific multipliers"""
        return {
            'fastest': {'crime_multiplier': 0.0, 'bike_bonus': 0.0},
            'safe': {'crime_multiplier': 1.0, 'bike_bonus': 0.0},
            'bike': {'crime_multiplier': 0.0, 'bike_bonus': 1.0},
            'safe_bike': {'crime_multiplier': 0.8, 'bike_bonus': 0.8}
        }
    
    def _finalize_weights(self, base_weights: Dict, route_multipliers: Dict,
                         crime_results: Dict, osm_results: Dict) -> Dict:
        """Finalize all weight calculations"""
        print("Finalizing weight calculations...")
        
        # Apply route multipliers to base weights
        final_weights = {
            'crime_multiplier': base_weights['crime_multiplier'],
            'bike_bonus': base_weights['bike_bonus'],
            'crime_type_weights': base_weights['crime_type_weights'],
            'route_multipliers': route_multipliers
        }
        
        # Final validation and adjustments
        final_weights = self._apply_final_adjustments(final_weights)
        
        return final_weights
    
    def _apply_final_adjustments(self, weights: Dict) -> Dict:
        """Apply final validation and adjustments to weights"""
        
        # Ensure crime multiplier is in reasonable range
        weights['crime_multiplier'] = max(100, min(15000, weights['crime_multiplier']))
        
        # Ensure bike bonus is in reasonable range
        weights['bike_bonus'] = max(0.1, min(0.8, weights['bike_bonus']))
        
        # Validate route multipliers
        for route_type, multipliers in weights['route_multipliers'].items():
            multipliers['crime_multiplier'] = max(0.0, min(2.0, multipliers['crime_multiplier']))
            multipliers['bike_bonus'] = max(0.0, min(1.5, multipliers['bike_bonus']))
        
        return weights
    
    def _validate_calibration(self, final_weights: Dict) -> Dict:
        """Final validation of calibrated weights"""
        print("Validating calibrated weights...")
        
        validation_results = {
            'weights_in_range': True,
            'crime_multiplier_valid': 100 <= final_weights['crime_multiplier'] <= 15000,
            'bike_bonus_valid': 0.1 <= final_weights['bike_bonus'] <= 0.8,
            'crime_types_mapped': len(final_weights['crime_type_weights']) > 0,
            'route_multipliers_valid': len(final_weights['route_multipliers']) == 4
        }
        
        validation_results['overall_valid'] = all(validation_results.values())
        
        print(f"Validation results: {validation_results}")
        return validation_results
    
    def export_calibrated_weights(self, output_path: str = "calibrated_weights.json") -> str:
        """Export calibrated weights to JSON file"""
        if self.calibrated_weights is None:
            raise ValueError("No calibrated weights available - run calibration first")
        
        output_file = Path(output_path)
        
        # Export to JSON
        with open(output_file, 'w') as f:
            json.dump(self.calibrated_weights.to_dict(), f, indent=2, default=str)
        
        print(f"Calibrated weights exported to: {output_file.absolute()}")
        return str(output_file.absolute())
    
    def load_calibrated_weights(self, input_path: str) -> CalibratedWeights:
        """Load calibrated weights from JSON file"""
        with open(input_path, 'r') as f:
            data = json.load(f)
        
        self.calibrated_weights = CalibratedWeights.from_dict(data)
        print(f"Calibrated weights loaded from: {input_path}")
        return self.calibrated_weights


# Example usage and testing
# Commented out to prevent execution during import
# if __name__ == "__main__":
#     calibrator = WeightCalibrator()
#     
#     # File paths
#     indy_csv = "../IndianapolisCrime.csv"
#     wl_json = "../WLCrime.json"
#     
#     try:
#         print("Starting weight calibration process...")
#         weights = calibrator.master_calibration(indy_csv, wl_json)
#         
#         print("\nFinal Calibrated Weights:")
#         print(f"Crime Weight Multiplier: {weights.CRIME_WEIGHT_MULTIPLIER:.1f}")
#         print(f"Bike Bonus Factor: {weights.BIKE_BONUS_FACTOR:.2f}")
#         print(f"Crime Types Mapped: {len(weights.CRIME_TYPE_WEIGHTS)}")
#         print(f"Route Multipliers: {len(weights.ROUTE_MULTIPLIERS)}")
#         
#         # Export weights
#         export_path = calibrator.export_calibrated_weights()
#         print(f"\nWeights exported to: {export_path}")
#         
#     except Exception as e:
#         print(f"Error in calibration: {e}")
#         import traceback
#         traceback.print_exc()
