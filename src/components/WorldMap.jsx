import { useMemo, useState } from "react";
import worldMap from "@svg-maps/world";
import Overlay from "./Overlay";
import "./css/WorldMap.css";

const WorldMap = ({ countries, onClose }) => {
  const [activeCountry, setActiveCountry] = useState("Select a country");
  const [pointer, setPointer] = useState(null);
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
        <div className="mapCanvas">
          <svg
            className="worldMapSvg"
            viewBox={worldMap.viewBox}
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
