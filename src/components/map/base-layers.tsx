"use client";

/**
 * Map backgrounds shared by every map: a street map (Esri World Street Map,
 * which is detailed in Saudi Arabia, falling back to OpenStreetMap if it
 * can't load) and satellite imagery with road and place labels on top.
 */
import { useEffect, useRef, useState } from "react";
import { TileLayer } from "react-leaflet";
import { cn } from "@/components/ui";

export type BaseLayer = "map" | "satellite";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const STREETS = `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`;
const IMAGERY = `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
const ROADS = `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`;
const PLACES = `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`;
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ESRI_CREDIT = 'Tiles &copy; <a href="https://www.esri.com">Esri</a>';

/** Tiles for the chosen background. Rendered inside a MapContainer. */
export function BaseLayerTiles({ layer, dark, attribution }: { layer: BaseLayer; dark: boolean; attribution: string }) {
  const [streetsFailed, setStreetsFailed] = useState(false);
  const errors = useRef(0);
  const loaded = useRef(0);

  if (layer === "satellite") {
    return (
      <>
        <TileLayer key="img" url={IMAGERY} maxZoom={19} maxNativeZoom={19} attribution={`${ESRI_CREDIT}, Maxar, Earthstar Geographics`} />
        <TileLayer key="roads" url={ROADS} maxZoom={19} opacity={0.9} />
        <TileLayer key="places" url={PLACES} maxZoom={19} />
      </>
    );
  }
  if (streetsFailed) {
    return <TileLayer key="osm" url={OSM} maxZoom={19} attribution={attribution} className={dark ? "masar-dark-tiles" : undefined} />;
  }
  return (
    <TileLayer
      key="streets"
      url={STREETS}
      maxZoom={19}
      attribution={`${ESRI_CREDIT}, HERE, Garmin, OpenStreetMap contributors`}
      className={dark ? "masar-dark-tiles" : undefined}
      eventHandlers={{
        tileload: () => {
          loaded.current += 1;
        },
        tileerror: () => {
          errors.current += 1;
          // Several failures and nothing loaded: this network blocks Esri, use OpenStreetMap
          if (errors.current >= 4 && loaded.current === 0) setStreetsFailed(true);
        },
      }}
    />
  );
}

/** Map / Satellite switch, placed over the map's top corner. */
export function LayerToggle({ value, onChange }: { value: BaseLayer; onChange: (v: BaseLayer) => void }) {
  const [ar, setAr] = useState(false);
  useEffect(() => setAr(document.documentElement.lang === "ar"), []);
  const items: { v: BaseLayer; label: string }[] = [
    { v: "map", label: ar ? "خريطة" : "Map" },
    { v: "satellite", label: ar ? "قمر صناعي" : "Satellite" },
  ];
  return (
    <div className="absolute end-3 top-3 z-[500] flex overflow-hidden rounded-full border border-black/10 bg-white/95 text-xs font-semibold shadow-md dark:border-white/10 dark:bg-brand-950/90" role="group">
      {items.map((x) => (
        <button
          key={x.v}
          type="button"
          aria-pressed={value === x.v}
          onClick={(e) => {
            e.stopPropagation();
            onChange(x.v);
          }}
          className={cn("min-h-9 px-3.5 transition-colors", value === x.v ? "bg-brand-500 text-white" : "text-slate-700 hover:bg-black/5 dark:text-slate-200")}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}
