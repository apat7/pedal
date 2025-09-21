"""
Weighted Graph Builder Module

This module creates four different weighted graphs for the four routing algorithms:
- Fastest Route: distance only
- Safe Route: distance + crime penalty  
- Bike Route: distance - bike bonus
- Safe + Bike Route: distance + crime penalty - bike bonus

Each graph uses the same network topology but with different edge weights
calculated based on the calibrated parameters.
"""

import networkx as nx
import numpy as np
from typing import Dict, Optional, Tuple, List
from dataclasses import dataclass
import pickle
from pathlib import Path

try:
    from crime_analyzer import CrimeDataAnalyzer
    from osm_analyzer import OSMAnalyzer  
    from weight_calibrator import CalibratedWeights
except ImportError:
    from .crime_analyzer import CrimeDataAnalyzer
    from .osm_analyzer import OSMAnalyzer  
    from .weight_calibrator import CalibratedWeights


@dataclass
class RouteType:
    """Route type configuration"""
    name: str
    use_crime_penalty: bool
    use_bike_bonus: bool
    crime_multiplier: float
    bike_multiplier: float
    description: str


class WeightedGraphBuilder:
    """
    Builds and manages weighted graphs for different routing algorithms.
    Creates four distinct graphs with optimized weights for each routing strategy.
    """
    
    def __init__(self):
        self.base_graph: Optional[nx.MultiDiGraph] = None
        self.weighted_graphs: Dict[str, nx.MultiDiGraph] = {}
        self.calibrated_weights: Optional[CalibratedWeights] = None
        self.crime_analyzer: Optional[CrimeDataAnalyzer] = None
        self.route_types: Dict[str, RouteType] = {}
        
        # Initialize route type configurations
        self._initialize_route_types()
    
    def _initialize_route_types(self):
        """Initialize the four route type configurations"""
        self.route_types = {
            'fastest': RouteType(
                name='fastest',
                use_crime_penalty=False,
                use_bike_bonus=False, 
                crime_multiplier=0.0,
                bike_multiplier=0.0,
                description='Shortest distance route'
            ),
            'safe': RouteType(
                name='safe',
                use_crime_penalty=True,
                use_bike_bonus=False,
                crime_multiplier=1.0,  # Will be updated with calibrated values
                bike_multiplier=0.0,
                description='Avoids high-crime areas'
            ),
            'bike': RouteType(
                name='bike',
                use_crime_penalty=False,
                use_bike_bonus=True,
                crime_multiplier=0.0,
                bike_multiplier=1.0,  # Will be updated with calibrated values
                description='Prioritizes bike infrastructure'
            ),
            'safe_bike': RouteType(
                name='safe_bike',
                use_crime_penalty=True,
                use_bike_bonus=True,
                crime_multiplier=0.8,  # Will be updated with calibrated values
                bike_multiplier=0.8,   # Will be updated with calibrated values
                description='Balances safety and bike-friendliness'
            )
        }
    
    def load_base_graph(self, graph: nx.MultiDiGraph) -> bool:
        """
        Load the base road network graph.
        
        Args:
            graph: NetworkX MultiDiGraph with road network
            
        Returns:
            True if successful, False otherwise
        """
        if graph is None or graph.number_of_nodes() == 0:
            print("Error: Invalid or empty graph provided")
            return False
        
        self.base_graph = graph.copy()
        print(f"Loaded base graph: {self.base_graph.number_of_nodes()} nodes, "
              f"{self.base_graph.number_of_edges()} edges")
        
        # Validate required edge attributes
        missing_attrs = self._validate_graph_attributes()
        if missing_attrs:
            print(f"Warning: Missing edge attributes: {missing_attrs}")
            self._add_missing_attributes()
        
        return True
    
    def _validate_graph_attributes(self) -> List[str]:
        """Validate that graph has required attributes"""
        required_attrs = ['length', 'has_bike_lane']
        missing_attrs = []
        
        # Check a sample of edges for required attributes
        edge_sample = list(self.base_graph.edges(keys=True, data=True))[:10]
        
        for attr in required_attrs:
            if not any(attr in data for _, _, _, data in edge_sample):
                missing_attrs.append(attr)
        
        return missing_attrs
    
    def _add_missing_attributes(self):
        """Add missing attributes to graph edges"""
        print("Adding missing edge attributes...")
        
        for u, v, k, data in self.base_graph.edges(keys=True, data=True):
            # Add length if missing
            if 'length' not in data:
                u_data = self.base_graph.nodes[u]
                v_data = self.base_graph.nodes[v]
                
                # Calculate Euclidean distance
                lat1, lon1 = u_data.get('y', 0), u_data.get('x', 0)
                lat2, lon2 = v_data.get('y', 0), v_data.get('x', 0)
                
                # Approximate distance in meters
                distance = self._calculate_distance(lat1, lon1, lat2, lon2)
                data['length'] = distance
            
            # Add bike infrastructure flag if missing
            if 'has_bike_lane' not in data:
                data['has_bike_lane'] = False
                data['bike_quality_score'] = 0.0
    
    def _calculate_distance(self, lat1: float, lon1: float, 
                           lat2: float, lon2: float) -> float:
        """Calculate approximate distance between two points in meters"""
        # Simplified distance calculation for small distances
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        # Convert to meters (rough approximation)
        lat_m = dlat * 111000  # ~111km per degree latitude
        lon_m = dlon * 111000 * np.cos(np.radians((lat1 + lat2) / 2))
        
        return np.sqrt(lat_m**2 + lon_m**2)
    
    def load_calibrated_weights(self, weights: CalibratedWeights) -> bool:
        """
        Load calibrated weights and update route type multipliers.
        
        Args:
            weights: CalibratedWeights object with optimized parameters
            
        Returns:
            True if successful, False otherwise
        """
        if weights is None:
            print("Error: No calibrated weights provided")
            return False
        
        self.calibrated_weights = weights
        
        # Update route type multipliers with calibrated values
        route_multipliers = weights.ROUTE_MULTIPLIERS
        
        for route_name, route_type in self.route_types.items():
            if route_name in route_multipliers:
                multipliers = route_multipliers[route_name]
                route_type.crime_multiplier = multipliers.get('crime_multiplier', 0.0)
                route_type.bike_multiplier = multipliers.get('bike_bonus', 0.0)
        
        print("Loaded calibrated weights and updated route multipliers")
        print(f"Crime weight multiplier: {weights.CRIME_WEIGHT_MULTIPLIER:.1f}")
        print(f"Bike bonus factor: {weights.BIKE_BONUS_FACTOR:.2f}")
        
        return True
    
    def set_crime_analyzer(self, crime_analyzer: CrimeDataAnalyzer) -> bool:
        """
        Set the crime analyzer for crime penalty calculations.
        
        Args:
            crime_analyzer: Initialized CrimeDataAnalyzer with processed data
            
        Returns:
            True if successful, False otherwise
        """
        if crime_analyzer is None or crime_analyzer.crime_density_grid is None:
            print("Error: Invalid crime analyzer or no crime data available")
            return False
        
        self.crime_analyzer = crime_analyzer
        print("Crime analyzer set successfully")
        return True
    
    def create_weighted_graphs(self) -> Dict[str, nx.MultiDiGraph]:
        """
        Create all four weighted graphs for different routing algorithms.
        
        Returns:
            Dictionary mapping route type names to their weighted graphs
        """
        if self.base_graph is None:
            raise ValueError("No base graph loaded - call load_base_graph() first")
        
        if self.calibrated_weights is None:
            raise ValueError("No calibrated weights loaded - call load_calibrated_weights() first")
        
        print("Creating weighted graphs for all route types...")
        
        self.weighted_graphs = {}
        
        for route_name, route_type in self.route_types.items():
            print(f"\nCreating {route_name} graph...")
            weighted_graph = self._create_single_weighted_graph(route_type)
            self.weighted_graphs[route_name] = weighted_graph
            
            # Calculate statistics
            stats = self._calculate_graph_statistics(weighted_graph, route_name)
            print(f"  {stats}")
        
        print(f"\nCompleted creation of {len(self.weighted_graphs)} weighted graphs")
        return self.weighted_graphs
    
    def _create_single_weighted_graph(self, route_type: RouteType) -> nx.MultiDiGraph:
        """
        Create a weighted graph for a specific route type.
        
        Args:
            route_type: RouteType configuration
            
        Returns:
            NetworkX MultiDiGraph with calculated weights
        """
        # Copy base graph
        graph = self.base_graph.copy()
        
        # Get calibrated parameters
        crime_base_multiplier = self.calibrated_weights.CRIME_WEIGHT_MULTIPLIER
        bike_base_bonus = self.calibrated_weights.BIKE_BONUS_FACTOR
        crime_type_weights = self.calibrated_weights.CRIME_TYPE_WEIGHTS
        
        # Apply route-specific multipliers
        crime_multiplier = crime_base_multiplier * route_type.crime_multiplier
        bike_bonus = bike_base_bonus * route_type.bike_multiplier
        
        total_edges = graph.number_of_edges()
        processed_edges = 0
        
        for u, v, k, data in graph.edges(keys=True, data=True):
            # Start with base distance
            base_length = data.get('length', 100)
            weight = base_length
            
            # Add crime penalty if enabled for this route type
            if route_type.use_crime_penalty and self.crime_analyzer is not None:
                crime_penalty = self._calculate_crime_penalty(
                    graph, u, v, crime_multiplier, crime_type_weights
                )
                weight += crime_penalty
            
            # Apply bike bonus if enabled for this route type
            if route_type.use_bike_bonus and data.get('has_bike_lane', False):
                bike_quality = data.get('bike_quality_score', 0.5)
                bike_reduction = base_length * bike_bonus * bike_quality
                
                # Ensure weight doesn't go below 10% of base length
                min_weight = base_length * 0.1
                weight = max(min_weight, weight - bike_reduction)
            
            # Ensure positive weight
            weight = max(1.0, weight)
            data['weight'] = weight
            
            processed_edges += 1
            
            # Progress indicator for large graphs
            if processed_edges % 10000 == 0:
                progress = (processed_edges / total_edges) * 100
                print(f"  Progress: {progress:.1f}% ({processed_edges}/{total_edges})")
        
        return graph
    
    def _calculate_crime_penalty(self, graph: nx.MultiDiGraph, u: int, v: int,
                                crime_multiplier: float, crime_type_weights: Dict) -> float:
        """
        Calculate crime penalty for a specific edge.
        
        Args:
            graph: Road network graph
            u: Source node ID
            v: Target node ID
            crime_multiplier: Crime weight multiplier
            crime_type_weights: Crime type severity weights
            
        Returns:
            Crime penalty value to add to edge weight
        """
        if self.crime_analyzer is None:
            return 0.0
        
        # Get edge midpoint coordinates
        u_data = graph.nodes[u]
        v_data = graph.nodes[v]
        
        mid_lat = (u_data.get('y', 0) + v_data.get('y', 0)) / 2
        mid_lon = (u_data.get('x', 0) + v_data.get('x', 0)) / 2
        
        # Get crime density at midpoint
        crime_density = self.crime_analyzer.get_crime_density_at_point(mid_lat, mid_lon)
        
        if crime_density <= 0:
            return 0.0
        
        # Apply average crime severity (could be made more sophisticated)
        avg_crime_severity = np.mean(list(crime_type_weights.values())) if crime_type_weights else 0.5
        
        # Calculate penalty
        penalty = crime_density * crime_multiplier * avg_crime_severity
        
        return penalty
    
    def _calculate_graph_statistics(self, graph: nx.MultiDiGraph, route_name: str) -> str:
        """Calculate and format statistics for a weighted graph"""
        weights = [data.get('weight', 0) for _, _, data in graph.edges(data=True)]
        
        if not weights:
            return f"{route_name}: No edges"
        
        weights = np.array(weights)
        
        stats = {
            'edges': len(weights),
            'min_weight': weights.min(),
            'max_weight': weights.max(), 
            'avg_weight': weights.mean(),
            'median_weight': np.median(weights)
        }
        
        return (f"{route_name}: {stats['edges']} edges, "
                f"weights {stats['min_weight']:.0f}-{stats['max_weight']:.0f} "
                f"(avg {stats['avg_weight']:.0f})")
    
    def get_graph(self, route_type: str) -> Optional[nx.MultiDiGraph]:
        """
        Get a specific weighted graph by route type.
        
        Args:
            route_type: Route type name ('fastest', 'safe', 'bike', 'safe_bike')
            
        Returns:
            Weighted graph for the specified route type, or None if not found
        """
        return self.weighted_graphs.get(route_type)
    
    def get_all_graphs(self) -> Dict[str, nx.MultiDiGraph]:
        """Get all weighted graphs"""
        return self.weighted_graphs.copy()
    
    def validate_graphs(self) -> Dict[str, bool]:
        """
        Validate all created graphs for correctness.
        
        Returns:
            Dictionary mapping route types to validation results
        """
        print("Validating weighted graphs...")
        
        validation_results = {}
        
        for route_name, graph in self.weighted_graphs.items():
            is_valid = True
            issues = []
            
            # Check basic properties
            if graph.number_of_nodes() == 0:
                is_valid = False
                issues.append("Empty graph")
            
            if graph.number_of_edges() == 0:
                is_valid = False
                issues.append("No edges")
            
            # Check edge weights
            edge_weights = []
            negative_weights = 0
            zero_weights = 0
            
            for _, _, data in graph.edges(data=True):
                weight = data.get('weight', 0)
                edge_weights.append(weight)
                
                if weight < 0:
                    negative_weights += 1
                elif weight == 0:
                    zero_weights += 1
            
            if negative_weights > 0:
                is_valid = False
                issues.append(f"{negative_weights} negative weights")
            
            if zero_weights > graph.number_of_edges() * 0.1:  # More than 10% zero weights
                issues.append(f"{zero_weights} zero weights")
            
            # Check weight distribution
            if edge_weights:
                weights_array = np.array(edge_weights)
                weight_std = weights_array.std()
                weight_mean = weights_array.mean()
                
                # Check for reasonable weight variation
                if weight_std < weight_mean * 0.01:  # Very low variation
                    issues.append("Very low weight variation")
            
            validation_results[route_name] = {
                'valid': is_valid,
                'issues': issues,
                'edge_count': len(edge_weights),
                'negative_weights': negative_weights,
                'zero_weights': zero_weights
            }
            
            status = "VALID" if is_valid else "INVALID"
            print(f"  {route_name}: {status} - {', '.join(issues) if issues else 'No issues'}")
        
        return validation_results
    
    def export_graphs(self, output_dir: str = "graphs") -> Dict[str, str]:
        """
        Export weighted graphs to files for later use.
        
        Args:
            output_dir: Directory to save graph files
            
        Returns:
            Dictionary mapping route types to file paths
        """
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        exported_files = {}
        
        for route_name, graph in self.weighted_graphs.items():
            filename = f"{route_name}_graph.pickle"
            file_path = output_path / filename
            
            # Export using pickle for full NetworkX compatibility
            with open(file_path, 'wb') as f:
                pickle.dump(graph, f)
            
            exported_files[route_name] = str(file_path.absolute())
            print(f"Exported {route_name} graph to: {file_path}")
        
        return exported_files
    
    def load_graphs(self, graph_files: Dict[str, str]) -> bool:
        """
        Load weighted graphs from files.
        
        Args:
            graph_files: Dictionary mapping route types to file paths
            
        Returns:
            True if successful, False otherwise
        """
        self.weighted_graphs = {}
        
        for route_name, file_path in graph_files.items():
            try:
                with open(file_path, 'rb') as f:
                    graph = pickle.load(f)
                
                self.weighted_graphs[route_name] = graph
                print(f"Loaded {route_name} graph from: {file_path}")
                
            except Exception as e:
                print(f"Error loading {route_name} graph: {e}")
                return False
        
        return True


# Example usage and testing
if __name__ == "__main__":
    from weight_calibrator import WeightCalibrator
    
    builder = WeightedGraphBuilder()
    
    # Example usage (would need actual data in practice)
    print("This is an example of how to use the WeightedGraphBuilder")
    print("In practice, you would:")
    print("1. Load a base graph from OSMAnalyzer")
    print("2. Load calibrated weights from WeightCalibrator")
    print("3. Set up crime analyzer")
    print("4. Create weighted graphs")
    print("5. Validate and export graphs")
    
    print(f"\nAvailable route types: {list(builder.route_types.keys())}")
    for name, route_type in builder.route_types.items():
        print(f"  {name}: {route_type.description}")
