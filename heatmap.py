import pandas as pd
import folium
from folium.plugins import HeatMap
import numpy as np
import json
import gc
import os
from datetime import datetime

def load_json_crime_data(json_file_path):
    """
    Load crime data from JSON file with the specific structure provided
    """
    print(f"🔍 Loading JSON crime data from: {json_file_path}")

    try:
        # Load JSON file
        with open(json_file_path, 'r') as file:
            data = json.load(file)

        print("✅ JSON file loaded successfully")

        # Extract incidents from the nested structure
        if 'result' in data and 'list' in data['result'] and 'incidents' in data['result']['list']:
            incidents = data['result']['list']['incidents']
            print(f"📊 Found {len(incidents)} incidents in JSON")
        else:
            print("❌ Could not find incidents in expected JSON structure")
            print("Available keys:", list(data.keys()) if isinstance(data, dict) else "Data is not a dictionary")
            return None

        # Convert to DataFrame for easier processing
        records = []

        for incident in incidents:
            # Extract coordinates from GeoJSON location
            if 'location' in incident and 'coordinates' in incident['location']:
                coords = incident['location']['coordinates']
                longitude = coords[0]  # First coordinate is longitude
                latitude = coords[1]   # Second coordinate is latitude

                record = {
                    'id': incident.get('id'),
                    'ccn': incident.get('ccn'),
                    'date': incident.get('date'),
                    'latitude': latitude,
                    'longitude': longitude,
                    'city': incident.get('city'),
                    'state': incident.get('state'),
                    'address': incident.get('blockizedAddress'),
                    'incident_type': incident.get('incidentType'),
                    'parent_incident_type': incident.get('parentIncidentType'),
                    'parent_incident_type_id': incident.get('parentIncidentTypeId'),
                    'narrative': incident.get('narrative'),
                    'agency_id': incident.get('agencyId'),
                    'customer_id': incident.get('customerId')
                }
                records.append(record)

        # Create DataFrame
        df = pd.DataFrame(records)

        if len(df) == 0:
            print("❌ No valid records found")
            return None

        print(f"✅ Processed {len(df)} crime records")
        print(f"📍 Coordinate columns: latitude, longitude")

        # Clean and validate coordinates
        df['latitude'] = pd.to_numeric(df['latitude'], errors='coerce')
        df['longitude'] = pd.to_numeric(df['longitude'], errors='coerce')

        # Remove invalid coordinates
        initial_count = len(df)
        df = df.dropna(subset=['latitude', 'longitude'])
        if len(df) < initial_count:
            print(f"🧹 Removed {initial_count - len(df)} records with invalid coordinates")

        # Filter for reasonable coordinate ranges
        df = df[
            (df['latitude'] >= 20) & (df['latitude'] <= 55) &
            (df['longitude'] >= -140) & (df['longitude'] <= -60)
            ]

        if len(df) < initial_count:
            print(f"🗺️  Filtered to {len(df)} records within valid coordinate ranges")

        return df, 'latitude', 'longitude', 'parent_incident_type', 'date'

    except FileNotFoundError:
        print(f"❌ File not found: {json_file_path}")
        return None
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON format: {e}")
        return None
    except Exception as e:
        print(f"❌ Error loading JSON data: {e}")
        return None

def load_multiple_json_files(file_pattern_or_list):
    """
    Load and combine multiple JSON files
    """
    import glob

    if isinstance(file_pattern_or_list, str):
        # If it's a pattern, find matching files
        if '*' in file_pattern_or_list:
            json_files = glob.glob(file_pattern_or_list)
        else:
            json_files = [file_pattern_or_list]
    else:
        # If it's already a list
        json_files = file_pattern_or_list

    print(f"🔍 Found {len(json_files)} JSON file(s) to process")

    all_dataframes = []
    total_records = 0

    for json_file in json_files:
        print(f"\n📁 Processing: {json_file}")
        result = load_json_crime_data(json_file)

        if result is not None:
            df, lat_col, lon_col, crime_col, date_col = result
            all_dataframes.append(df)
            total_records += len(df)
            print(f"   Added {len(df)} records from {json_file}")

    if not all_dataframes:
        print("❌ No valid data found in any files")
        return None

    # Combine all DataFrames
    print(f"\n🔗 Combining {len(all_dataframes)} datasets...")
    combined_df = pd.concat(all_dataframes, ignore_index=True)

    # Remove duplicates based on ID if available
    if 'id' in combined_df.columns:
        initial_count = len(combined_df)
        combined_df = combined_df.drop_duplicates(subset=['id'])
        if len(combined_df) < initial_count:
            print(f"🧹 Removed {initial_count - len(combined_df)} duplicate records")

    print(f"✅ Final dataset: {len(combined_df)} total records")

    return combined_df, 'latitude', 'longitude', 'parent_incident_type', 'date'

def create_json_crime_heatmap(df, lat_col, lon_col, output_file='json_crime_heatmap.html'):
    """
    Create heat map from JSON crime data
    """
    if df is None or len(df) == 0:
        print("❌ No valid data to create heat map")
        return

    print(f"🗺️  Creating heat map with {len(df):,} crime points...")

    # Calculate center point from actual data
    center_lat = float(df[lat_col].median())
    center_lon = float(df[lon_col].median())
    center_point = [center_lat, center_lon]

    # Determine appropriate zoom level based on data spread
    lat_range = df[lat_col].max() - df[lat_col].min()
    lon_range = df[lon_col].max() - df[lon_col].min()

    if max(lat_range, lon_range) > 10:
        zoom_start = 6  # Wide area
    elif max(lat_range, lon_range) > 2:
        zoom_start = 9  # Metro area
    elif max(lat_range, lon_range) > 0.5:
        zoom_start = 12  # City level
    else:
        zoom_start = 14  # Neighborhood level

    print(f"📍 Map center: [{center_lat:.4f}, {center_lon:.4f}], zoom: {zoom_start}")

    # Create base map
    m = folium.Map(
        location=center_point,
        zoom_start=zoom_start,
        tiles=None,
        prefer_canvas=True
    )

    # Add tile layers
    folium.TileLayer(
        tiles='https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
        attr='Google Maps',
        name='Google Maps',
        overlay=False,
        control=True
    ).add_to(m)

    folium.TileLayer(
        tiles='https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
        attr='Google Satellite',
        name='Google Satellite',
        overlay=False,
        control=True
    ).add_to(m)

    folium.TileLayer(
        'CartoDB positron',
        name='Light Map',
        overlay=False,
        control=True
    ).add_to(m)

    folium.TileLayer(
        'OpenStreetMap',
        name='Street Map',
        overlay=False,
        control=True
    ).add_to(m)

    # Prepare heat map data
    print("🔥 Preparing heat map data...")
    coords_array = df[[lat_col, lon_col]].values
    valid_mask = ~np.isnan(coords_array).any(axis=1)
    clean_coords = coords_array[valid_mask]
    heat_data = clean_coords.tolist()

    print(f"✅ Heat map data ready: {len(heat_data):,} points")

    # Create heat map with optimized settings
    HeatMap(
        heat_data,
        min_opacity=0.1,
        max_zoom=16,
        radius=20,
        blur=15,
        gradient={
            0.0: '#000033',    # Very dark blue
            0.1: '#000080',    # Dark blue
            0.2: '#0000FF',    # Blue
            0.3: '#0080FF',    # Light blue
            0.4: '#00FFFF',    # Cyan
            0.5: '#00FF80',    # Blue-green
            0.6: '#00FF00',    # Green
            0.7: '#80FF00',    # Yellow-green
            0.8: '#FFFF00',    # Yellow
            0.85: '#FF8000',   # Orange
            0.9: '#FF4000',    # Red-orange
            0.95: '#FF0000',   # Red
            1.0: '#800000'     # Dark red
        },
        use_local_extrema=True
    ).add_to(m)

    # Add layer control
    folium.LayerControl().add_to(m)

    # Create enhanced legend with crime data info
    data_summary = ""
    if 'parent_incident_type' in df.columns:
        top_crimes = df['parent_incident_type'].value_counts().head(3)
        data_summary = "<br/>".join([f"{crime}: {count}" for crime, count in top_crimes.items()])

    legend_html = f'''
    <div style="position: fixed; 
                bottom: 50px; right: 50px; width: 200px; height: 280px; 
                background-color: white; border:2px solid grey; z-index:9999; 
                font-size:11px; padding: 12px; opacity: 0.95;
                box-shadow: 0 0 15px rgba(0,0,0,0.2);
                ">
    <h4 style="margin-top:0;">Crime Heat Map</h4>
    <div style="background: linear-gradient(to top, #000033, #000080, #0000FF, #0080FF, #00FFFF, #00FF80, #00FF00, #80FF00, #FFFF00, #FF8000, #FF4000, #FF0000, #800000);
                height: 120px; width: 25px; float: left; margin-right: 10px;">
    </div>
    <div style="float: left; height: 120px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>Highest</div>
        <div>High</div>
        <div>Medium</div>
        <div>Low</div>
        <div>Lowest</div>
    </div>
    <div style="clear: both; margin-top: 10px; font-size: 10px;">
        <strong>{len(heat_data):,}</strong> total incidents<br/>
        <div style="margin-top: 8px; font-size: 9px;">
        <strong>Top Crime Types:</strong><br/>
        {data_summary}
        </div>
    </div>
    </div>
    '''
    m.get_root().html.add_child(folium.Element(legend_html))

    # Save the map
    print(f"💾 Saving heat map...")
    m.save(output_file)
    print(f"✅ Heat map saved as {output_file}")

    return m

def analyze_json_crime_data(df, crime_type_col=None, date_col=None):
    """
    Analyze the JSON crime dataset
    """
    if df is None:
        return

    print("\n" + "="*60)
    print("JSON CRIME DATA ANALYSIS")
    print("="*60)

    print(f"📊 Total crime incidents: {len(df):,}")

    # Geographic analysis
    if 'latitude' in df.columns and 'longitude' in df.columns:
        lat_range = df['latitude'].max() - df['latitude'].min()
        lon_range = df['longitude'].max() - df['longitude'].min()
        print(f"📍 Geographic coverage:")
        print(f"   Latitude range: {df['latitude'].min():.4f} to {df['latitude'].max():.4f} ({lat_range:.4f}°)")
        print(f"   Longitude range: {df['longitude'].min():.4f} to {df['longitude'].max():.4f} ({lon_range:.4f}°)")

    # Crime type analysis
    if crime_type_col and crime_type_col in df.columns:
        print(f"\n🏷️  Crime Types Distribution:")
        crime_counts = df[crime_type_col].value_counts()
        for i, (crime, count) in enumerate(crime_counts.head(10).items(), 1):
            percentage = (count / len(df)) * 100
            print(f"  {i:2d}. {crime}: {count:,} ({percentage:.1f}%)")

        if len(crime_counts) > 10:
            print(f"     ... and {len(crime_counts) - 10} other crime types")

    # City analysis
    if 'city' in df.columns:
        cities = df['city'].value_counts()
        print(f"\n🏙️  Cities represented:")
        for city, count in cities.head(5).items():
            percentage = (count / len(df)) * 100
            print(f"   {city}: {count:,} ({percentage:.1f}%)")

    # Agency analysis
    if 'customer_id' in df.columns:
        agencies = df['customer_id'].value_counts()
        print(f"\n👮 Agencies:")
        for agency, count in agencies.head(5).items():
            percentage = (count / len(df)) * 100
            print(f"   {agency}: {count:,} ({percentage:.1f}%)")

    # Date analysis
    if date_col and date_col in df.columns:
        try:
            df['date_parsed'] = pd.to_datetime(df[date_col])
            date_range = df['date_parsed'].max() - df['date_parsed'].min()
            print(f"\n📅 Date range: {df['date_parsed'].min().strftime('%Y-%m-%d')} to {df['date_parsed'].max().strftime('%Y-%m-%d')}")
            print(f"   Total period: {date_range.days} days")
        except:
            print(f"\n📅 Date column found but could not parse dates")

def main():
    """
    Main function for processing JSON crime data
    """
    print("🔥 JSON CRIME DATA HEAT MAP GENERATOR")
    print("Processes JSON files with incident data structure")
    print("="*60)

    # Get JSON file(s) from user
    json_input = input("Enter JSON file path or pattern (e.g., 'crime_data.json' or 'data/*.json'): ").strip()
    if not json_input:
        json_input = 'jamal.json'  # Default

    print(f"📁 Looking for: {json_input}")

    # Check if it's a pattern or single file
    if '*' in json_input or isinstance(json_input, list):
        result = load_multiple_json_files(json_input)
    else:
        if os.path.exists(json_input):
            file_size = os.path.getsize(json_input) / (1024**2)  # MB
            print(f"📁 File size: {file_size:.1f} MB")
        result = load_json_crime_data(json_input)

    if result is None:
        print("❌ Failed to load JSON data. Please check your file(s).")
        return

    df, lat_col, lon_col, crime_type_col, date_col = result

    # Analyze the data
    analyze_json_crime_data(df, crime_type_col, date_col)

    # Create heat map
    output_file = input(f"\nEnter output filename (default: 'json_crime_heatmap.html'): ").strip()
    if not output_file:
        output_file = 'json_crime_heatmap.html'

    create_json_crime_heatmap(df, lat_col, lon_col, output_file)

    print(f"\n🎉 SUCCESS! Heat map created.")
    print(f"📂 Open '{output_file}' in your web browser")
    print(f"📍 Visualizing {len(df):,} crime incidents")

    print(f"\n⚡ Features:")
    print("✅ Automatic JSON structure detection")
    print("✅ GeoJSON coordinate extraction")
    print("✅ Multiple map layers (Google Maps, Satellite, etc.)")
    print("✅ Crime type analysis and legend")
    print("✅ Support for multiple JSON files")
    print("✅ Optimized for large datasets")

    print(f"\n💡 Usage Tips:")
    print("• Zoom in to see detailed crime patterns")
    print("• Use layer control to switch map types")
    print("• Legend shows top crime types from your data")
    print("• Heat colors indicate crime concentration levels")

if __name__ == "__main__":
    print("📦 Required libraries: pandas, folium, numpy")
    print("🔧 Install with: pip install pandas folium numpy")
    print("-" * 60)

    main()