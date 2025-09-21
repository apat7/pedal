'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Map } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

interface StaticBlurredMapProps {
  apiKey: string;
  className?: string;
}

const StaticBlurredMap: React.FC<StaticBlurredMapProps> = ({ apiKey, className }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const zoom = 14;
  const latitude = 40.4237; // Purdue University latitude
  const longitude = -86.9212; // Purdue University longitude

  useEffect(() => {
    if (map.current) return; // Stops map from re-rendering

    if (mapContainer.current) {
      map.current = new Map({
        container: mapContainer.current,
        apiKey: apiKey,
        center: [longitude, latitude],
        zoom: zoom,
        style: 'https://api.maptiler.com/maps/streets-v2/style.json',
        interactive: false, // Disable all map interactions
        attributionControl: false, // Disable attribution control
      });

      // Explicitly disable all interactions
      map.current.scrollZoom.disable();
      map.current.doubleClickZoom.disable();
      map.current.boxZoom.disable();
      map.current.dragPan.disable();
      map.current.keyboard.disable();
      map.current.touchZoomRotate.disable();
      map.current.dragRotate.disable();
      map.current.touchPitch.disable();
    }

    // Clean up map on component unmount
    return () => {
      map.current?.remove();
    };
  }, [apiKey, latitude, longitude, zoom]);

  return (
    <div ref={mapContainer} className={className} style={{ width: '100%', height: '100%' }} />
  );
}

export default StaticBlurredMap;
