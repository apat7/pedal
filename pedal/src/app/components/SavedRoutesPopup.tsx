'use client';

import React, { useState, useEffect } from 'react';
import { X, Trash2, Navigation } from 'lucide-react';

interface SavedRoutesPopupProps {
  routes: any[];
  onClose: () => void;
  onDeleteRoute: (routeId: string) => void;
  onLoadRoute: (route: any) => void;
}

const SavedRoutesPopup: React.FC<SavedRoutesPopupProps> = ({ routes, onClose, onDeleteRoute, onLoadRoute }) => {
  const handleDeleteClick = (routeId: string) => {
    onDeleteRoute(routeId);
  };

  const handleLoadRoute = (route: any) => {
    onLoadRoute(route);
    onClose(); // Close the popup after loading the route
  };

  // Handle click outside to close
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key to close
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [onClose]);

  // Prevent body scroll when popup is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="popup-overlay" onClick={handleOverlayClick}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <button className="popup-close-btn" onClick={onClose}>
          <X size={24} />
        </button>
        <h2>Your Saved Routes</h2>
        {routes.length === 0 ? (
          <p>You haven't saved any routes yet.</p>
        ) : (
          <div className="routes-list">
            {routes.map((route, idx) => (
              <div key={idx} className="route-item">
                <div className="route-info">
                  <strong>{route.start?.name || 'Unknown'} → {route.end?.name || 'Unknown'}</strong>
                  <p>Type: {route.type}</p>
                  <p>Saved: {new Date(route.timestamp).toLocaleDateString()}</p>
                  {route.routeData && (
                    <p>Distance: {(route.routeData.distance_meters / 1000).toFixed(2)} km</p>
                  )}
                </div>
                <div className="route-actions">
                  <button 
                    className="load-route-btn" 
                    onClick={() => handleLoadRoute(route)}
                    title="Load route into form"
                  >
                    <Navigation size={16} />
                  </button>
                  <button 
                    className="delete-route-btn" 
                    onClick={() => handleDeleteClick(route.id)}
                    title="Delete route"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedRoutesPopup;
