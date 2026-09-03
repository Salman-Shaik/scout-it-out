import { useMemo, useState } from "react";
import worldMap from "@svg-maps/world";
import Overlay from "./Overlay";
import "./css/WorldMap.css";

const WORLD_VIEW = { x: 0, y: 0, width: 1010, height: 666 };
const REGION_VIEWS = {
  europe: { x: 430, y: 205, width: 190, height: 150 },
  northAmerica: { x: 25, y: 120, width: 390, height: 330 },
};

const WorldMap = ({ countries, onClose }) => {
  const [activeCountry, setActiveCountry] = useState("Select a country");
  const [pointer, setPointer] = useState(null);
  const [view, setView] = useState(WORLD_VIEW);
  const countryNames = useMemo(
    () =>
      new Map(
        countries.map((country) => [country.country_code, country.answer]),
      ),
    [countries],
  );
  const locations = worldMap.locations.filter((location) =>
    countryNames.has(location.id),
  );

  const showCountry = (location, event) => {
    const bounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    setActiveCountry(countryNames.get(location.id));
    setPointer({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  };

  const zoomBy = (factor) => {
    setView((current) => {
      const width = current.width * factor;
      const height = current.height * factor;
      return {
        x: current.x + (current.width - width) / 2,
        y: current.y + (current.height - height) / 2,
        width,
        height,
      };
    });
  };

  const viewBox = `${view.x} ${view.y} ${view.width} ${view.height}`;

  return (
    <Overlay showOverlay>
      <section className="worldMapDialog" aria-labelledby="world-map-title">
        <header className="worldMapHeader">
          <div>
            <span className="section-kicker">Explore the globe</span>
            <h2 id="world-map-title">World map</h2>
          </div>
          <button type="button" className="mapCloseButton" onClick={onClose}>
            Close map
          </button>
        </header>
        <p className="mapInstructions">
          Hover, tap, or use the keyboard to discover country names.
        </p>
        <nav className="mapControls" aria-label="Map controls">
          <div className="regionControls">
            <button type="button" onClick={() => setView(REGION_VIEWS.europe)}>
              Europe
            </button>
            <button
              type="button"
              onClick={() => setView(REGION_VIEWS.northAmerica)}
            >
              North America
            </button>
            <button type="button" onClick={() => setView(WORLD_VIEW)}>
              Whole world
            </button>
          </div>
          <div className="zoomControls">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => zoomBy(1.35)}
              disabled={view.width >= WORLD_VIEW.width}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => zoomBy(0.7)}
              disabled={view.width <= 180}
            >
              +
            </button>
          </div>
        </nav>
        <div className="mapCanvas">
          <svg
            className="worldMapSvg"
            viewBox={viewBox}
            role="img"
            aria-label="Interactive world map"
          >
            {locations.map((location) => {
              const name = countryNames.get(location.id);
              return (
                <path
                  key={location.id}
                  d={location.path}
                  className="mapCountry"
                  role="button"
                  tabIndex="0"
                  aria-label={name}
                  onMouseMove={(event) => showCountry(location, event)}
                  onMouseLeave={() => setPointer(null)}
                  onClick={(event) => showCountry(location, event)}
                  onFocus={() => setActiveCountry(name)}
                >
                  <title>{name}</title>
                </path>
              );
            })}
          </svg>
          {pointer && (
            <span
              className="mapPopup"
              style={{ left: pointer.x, top: pointer.y }}
              role="status"
            >
              {activeCountry}
            </span>
          )}
        </div>
        <output className="selectedCountry" aria-live="polite">
          {activeCountry}
        </output>
      </section>
    </Overlay>
  );
};

export default WorldMap;
