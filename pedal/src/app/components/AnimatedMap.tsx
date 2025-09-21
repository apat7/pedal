import React from 'react';

const AnimatedMap: React.FC = () => {
  return (
    <div className="map-preview">
      <div className="map-content">
        {/* Map 1: Downtown to University Route */}
        <div className="city-map map-1">
          {/* Street Grid */}
          <div className="street street-h" style={{ top: '20%' }}></div>
          <div className="street street-h" style={{ top: '40%' }}></div>
          <div className="street street-h major-street" style={{ top: '60%' }}></div>
          <div className="street street-h" style={{ top: '80%' }}></div>
          <div className="street street-v" style={{ left: '15%' }}></div>
          <div className="street street-v major-street" style={{ left: '30%' }}></div>
          <div className="street street-v" style={{ left: '45%' }}></div>
          <div className="street street-v" style={{ left: '60%' }}></div>
          <div className="street street-v major-street" style={{ left: '75%' }}></div>
          <div className="street street-v" style={{ left: '90%' }}></div>

          {/* Building blocks */}
          <div className="building-block" style={{ top: '5%', left: '5%', width: '8%', height: '12%' }}></div>
          <div className="building-block" style={{ top: '25%', left: '35%', width: '7%', height: '10%' }}></div>
          <div className="building-block" style={{ top: '45%', left: '20%', width: '6%', height: '10%' }}></div>
          <div className="building-block" style={{ top: '65%', left: '50%', width: '8%', height: '12%' }}></div>
          <div className="building-block" style={{ top: '85%', left: '80%', width: '7%', height: '10%' }}></div>

          {/* Parks */}
          <div className="park" style={{ top: '10%', left: '65%', width: '20%', height: '25%' }}></div>
          <div className="poi-label" style={{ top: '20%', left: '70%' }}>Central Park</div>

          {/* Water feature */}
          <div className="water" style={{ top: '70%', left: '10%', width: '15%', height: '20%' }}></div>
          <div className="poi-label" style={{ top: '78%', left: '13%' }}>Lake</div>

          {/* Bike lanes */}
          <div className="bike-lane" style={{ top: '60%', left: '0', width: '100%', height: '4px' }}></div>
          <div className="bike-lane" style={{ top: '0', left: '75%', width: '4px', height: '100%' }}></div>

          {/* SVG Route Path */}
          <svg style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 5 }}>
            <path className="route-path animated" d="M 30 350 L 30 240 Q 30 220 50 220 L 120 220 Q 140 220 140 240 L 140 240 Q 140 260 160 260 L 300 260 Q 320 260 320 240 L 320 80" />
          </svg>

          {/* Route markers */}
          <div className="route-marker marker-start" style={{ top: '85%', left: '6%' }}>A</div>
          <div className="route-marker marker-end" style={{ top: '18%', left: '77%' }}>B</div>

          {/* POI Labels */}
          <div className="poi-label" style={{ top: '88%', left: '12%' }}>Coffee District</div>
          <div className="poi-label" style={{ top: '15%', left: '83%' }}>University</div>
          <div className="poi-label" style={{ top: '55%', left: '35%' }}>Main St</div>

          {/* Safe zones */}
          <div className="safe-zone" style={{ top: '50%', left: '25%', width: '60px', height: '60px' }}></div>
        </div>

        {/* Map 2: Residential to Business District Route */}
        <div className="city-map map-2">
          {/* Street Grid */}
          <div className="street street-h" style={{ top: '15%' }}></div>
          <div className="street street-h major-street" style={{ top: '35%' }}></div>
          <div className="street street-h" style={{ top: '55%' }}></div>
          <div className="street street-h" style={{ top: '75%' }}></div>
          <div className="street street-h" style={{ top: '90%' }}></div>
          <div className="street street-v major-street" style={{ left: '20%' }}></div>
          <div className="street street-v" style={{ left: '40%' }}></div>
          <div className="street street-v" style={{ left: '55%' }}></div>
          <div className="street street-v major-street" style={{ left: '70%' }}></div>
          <div className="street street-v" style={{ left: '85%' }}></div>

          {/* Building blocks */}
          <div className="building-block" style={{ top: '20%', left: '75%', width: '10%', height: '12%' }}></div>
          <div className="building-block" style={{ top: '40%', left: '45%', width: '8%', height: '10%' }}></div>
          <div className="building-block" style={{ top: '60%', left: '25%', width: '10%', height: '8%' }}></div>
          <div className="building-block" style={{ top: '80%', left: '60%', width: '8%', height: '8%' }}></div>

          {/* Parks */}
          <div className="park" style={{ top: '60%', left: '72%', width: '25%', height: '30%' }}></div>
          <div className="poi-label" style={{ top: '72%', left: '78%' }}>Riverside Park</div>

          <div className="park" style={{ top: '5%', left: '5%', width: '12%', height: '20%' }}></div>
          <div className="poi-label" style={{ top: '12%', left: '7%' }}>Grove</div>

          {/* Bike lanes */}
          <div className="bike-lane" style={{ top: '35%', left: '0', width: '100%', height: '4px' }}></div>
          <div className="bike-lane" style={{ top: '0', left: '20%', width: '4px', height: '100%' }}></div>
          <div className="bike-lane" style={{ top: '0', left: '70%', width: '4px', height: '55%' }}></div>

          {/* SVG Route Path */}
          <svg style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 5 }}>
            <path className="route-path animated" d="M 80 60 L 80 140 Q 80 160 100 160 L 280 160 Q 300 160 300 180 L 300 300 Q 300 320 320 320 L 380 320" />
          </svg>

          {/* Route markers */}
          <div className="route-marker marker-start" style={{ top: '13%', left: '17%' }}>A</div>
          <div className="route-marker marker-end" style={{ top: '78%', left: '87%' }}>B</div>

          {/* POI Labels */}
          <div className="poi-label" style={{ top: '10%', left: '24%' }}>Residence</div>
          <div className="poi-label" style={{ top: '75%', left: '92%' }}>Business District</div>
          <div className="poi-label" style={{ top: '32%', left: '50%' }}>Bike Boulevard</div>
          <div className="poi-label" style={{ top: '45%', left: '10%' }}>School Zone</div>

          {/* Safe zones */}
          <div className="safe-zone" style={{ top: '30%', left: '45%', width: '80px', height: '80px' }}></div>
          <div className="safe-zone" style={{ top: '65%', left: '65%', width: '50px', height: '50px' }}></div>
        </div>

        <div className="safety-badge">✓ Safe Route</div>
      </div>
    </div>
  );
};

export default AnimatedMap;
