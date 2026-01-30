import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Farm } from '../../types';
import { MapPin } from 'lucide-react';

interface FarmMapViewProps {
  farms: Farm[];
  selectedFarmId?: string | null;
  onFarmClick?: (farm: Farm) => void;
  height?: string;
}

declare global {
  interface Window {
    L: any;
  }
}

const FarmMapView: React.FC<FarmMapViewProps> = ({
  farms,
  selectedFarmId,
  onFarmClick,
  height = '500px',
}) => {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const isMapInitializedRef = useRef(false);

  // Filter farms with GPS coordinates
  const farmsWithGPS = useMemo(() => {
    return farms.filter(
      farm =>
        farm.latitude !== undefined &&
        farm.latitude !== null &&
        farm.longitude !== undefined &&
        farm.longitude !== null
    );
  }, [farms]);

  // Create marker icon
  const createMarkerIcon = useCallback((isSelected: boolean) => {
    if (!window.L) return null;
    return window.L.divIcon({
      className: `custom-marker ${isSelected ? 'selected' : ''}`,
      html: `
        <div class="marker-pin ${isSelected ? 'selected' : ''}" style="
          background-color: ${isSelected ? '#10b981' : '#ef4444'};
          width: 30px;
          height: 30px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          position: relative;
          cursor: pointer;
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(45deg);
            color: white;
            font-size: 16px;
            font-weight: bold;
          ">📍</div>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
    });
  }, []);

  // Create popup content with navigation button
  const createPopupContent = useCallback((farm: Farm) => {
    return `
      <div style="padding: 8px; min-width: 220px;">
        <h3 style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px; color: #111827;">
          ${farm.name || farm.location}
        </h3>
        <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
          <strong>Location:</strong> ${farm.location}
        </p>
        <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
          <strong>Owner:</strong> ${farm.ownerName || farm.farmerName}
        </p>
        ${farm.varieties && farm.varieties.length > 0 ? `
          <p style="margin: 4px 0; font-size: 12px; color: #6b7280;">
            <strong>Varieties:</strong> ${farm.varieties.join(', ')}
          </p>
        ` : ''}
        <p style="margin: 4px 0; font-size: 11px; color: #9ca3af;">
          GPS: ${farm.latitude?.toFixed(4)}, ${farm.longitude?.toFixed(4)}
        </p>
        <button
          onclick="window.dispatchEvent(new CustomEvent('navigateToFarm', { detail: '${farm.id}' }))"
          style="
            margin-top: 8px;
            width: 100%;
            padding: 6px 12px;
            background-color: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
          "
          onmouseover="this.style.backgroundColor='#2563eb'"
          onmouseout="this.style.backgroundColor='#3b82f6'"
        >
          ดูรายละเอียด Farm
        </button>
      </div>
    `;
  }, []);

  // Listen for navigation events from popup
  useEffect(() => {
    const handleNavigate = (event: CustomEvent) => {
      const farmId = event.detail;
      navigate(`/farmer-dashboard/farm/${farmId}`);
    };
    window.addEventListener('navigateToFarm', handleNavigate as EventListener);
    return () => {
      window.removeEventListener('navigateToFarm', handleNavigate as EventListener);
    };
  }, [navigate]);

  // Initialize map once
  useEffect(() => {
    if (isMapInitializedRef.current) return;

    const loadLeaflet = () => {
      if (window.L) {
        initializeMap();
        return;
      }

      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      script.onload = initializeMap;
      document.body.appendChild(script);
    };

    const initializeMap = () => {
      if (!mapRef.current || !window.L || mapInstanceRef.current) return;

      if (farmsWithGPS.length === 0) {
        return;
      }

      // Calculate center point
      const avgLat =
        farmsWithGPS.reduce((sum, farm) => sum + (farm.latitude || 0), 0) /
        farmsWithGPS.length;
      const avgLng =
        farmsWithGPS.reduce((sum, farm) => sum + (farm.longitude || 0), 0) /
        farmsWithGPS.length;

      // Initialize map
      const map = window.L.map(mapRef.current).setView([avgLat, avgLng], 10);

      // Add OpenStreetMap tiles
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      isMapInitializedRef.current = true;
    };

    loadLeaflet();

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersRef.current.clear();
        isMapInitializedRef.current = false;
      }
    };
  }, []); // Only run once on mount

  // Update markers when farms or selection changes (without resetting zoom)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;

    const map = mapInstanceRef.current;
    const existingMarkers = markersRef.current;
    const currentFarmIds = new Set(farmsWithGPS.map(f => f.id));

    // Remove markers for farms that no longer exist
    existingMarkers.forEach((marker, farmId) => {
      if (!currentFarmIds.has(farmId)) {
        map.removeLayer(marker);
        existingMarkers.delete(farmId);
      }
    });

    // Add or update markers for current farms
    farmsWithGPS.forEach(farm => {
      const isSelected = farm.id === selectedFarmId;
      const existingMarker = existingMarkers.get(farm.id);

      if (existingMarker) {
        // Update existing marker icon (for selection state change)
        existingMarker.setIcon(createMarkerIcon(isSelected));
        existingMarker.setPopupContent(createPopupContent(farm));
      } else {
        // Create new marker
        const marker = window.L.marker([farm.latitude!, farm.longitude!], {
          icon: createMarkerIcon(isSelected),
        }).addTo(map);

        marker.bindPopup(createPopupContent(farm));

        if (onFarmClick) {
          marker.on('click', () => {
            onFarmClick(farm);
          });
        }

        existingMarkers.set(farm.id, marker);
      }
    });

    // Fit bounds only on first load (when no markers existed before)
    if (farmsWithGPS.length > 0 && existingMarkers.size === farmsWithGPS.length) {
      const allMarkers = Array.from(existingMarkers.values());
      if (allMarkers.length > 1 && !isMapInitializedRef.current) {
        const group = new window.L.featureGroup(allMarkers);
        map.fitBounds(group.getBounds().pad(0.1));
      }
    }
  }, [farmsWithGPS, selectedFarmId, onFarmClick, createMarkerIcon, createPopupContent]);

  if (farmsWithGPS.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-300"
        style={{ height }}
      >
        <MapPin className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-600 font-semibold mb-2">No farms with GPS coordinates</p>
        <p className="text-sm text-gray-500 text-center px-4">
          Add GPS coordinates to your farms to view them on the map
        </p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <div ref={mapRef} style={{ height, width: '100%' }} />
      <style>{`
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
        .marker-pin.selected {
          background-color: #10b981 !important;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2) !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 8px;
        }
        .leaflet-popup-content {
          margin: 0;
        }
      `}</style>
    </div>
  );
};

export default FarmMapView;

