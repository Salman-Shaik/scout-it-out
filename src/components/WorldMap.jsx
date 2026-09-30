import { useMemo, useState } from "react";
import worldMap from "@svg-maps/world";
import Overlay from "./Overlay";
import "./css/WorldMap.css";

const WORLD_VIEW = { x: 0, y: 0, width: 1010, height: 666 };
const REGION_VIEWS = {
  europe: { x: 430, y: 205, width: 190, height: 150 },
  centralAmericaAndCaribbean: { x: 170, y: 300, width: 265, height: 190 },
  pacificIslands: { x: 785, y: 350, width: 225, height: 230 },
};

const WorldMap = ({ countries, onClose, onCountrySelect, submitting = false,
  guessingDisabled = false, guessingMessage = "" }) => {
  const [activeCountry, setActiveCountry] = useState("Select a country");
  const [activeCode, setActiveCode] = useState(null);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [pointer, setPointer] = useState(null);
  const [view, setView] = useState(WORLD_VIEW);
  const [region, setRegion] = useState("world");
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
  const countryOptions = [...countryNames.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const pacificOptions = countries
    .filter((country) => country.continent === "Oceania")
    .map((country) => [country.country_code, country.answer])
    .sort((a, b) => a[1].localeCompare(b[1]));

  const showHoveredCountry = (location, event) => {
    const bounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    setHoveredCountry(countryNames.get(location.id));
    setPointer({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
  };

  const selectCountry = (code) => {
    setActiveCode(code);
    setActiveCountry(countryNames.get(code));
  };

  const useRegion = (name, nextView) => {
    setRegion(name);
    setView(nextView);
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
    <Overlay showOverlay labelledBy="world-map-title">
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
          {onCountrySelect
            ? "Tap a country, then submit it as your guess."
            : "Hover, tap, or use the keyboard to discover country names."}
        </p>
        <nav className="mapControls" aria-label="Map controls">
          <div className="regionControls">
            <button type="button" onClick={() => useRegion("europe", REGION_VIEWS.europe)}>
              Europe
            </button>
            <button
              type="button"
              onClick={() => useRegion("caribbean", REGION_VIEWS.centralAmericaAndCaribbean)}
            >
              Caribbean &amp; Central America
            </button>
            <button
              type="button"
              onClick={() => useRegion("pacific", REGION_VIEWS.pacificIslands)}
            >
              Pacific Islands
            </button>
            <button type="button" onClick={() => useRegion("world", WORLD_VIEW)}>
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
                  aria-pressed={activeCode === location.id}
                  onMouseMove={(event) => showHoveredCountry(location, event)}
                  onMouseLeave={() => { setPointer(null); setHoveredCountry(null); }}
                  onClick={() => selectCountry(location.id)}
                  onFocus={() => selectCountry(location.id)}
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
              {hoveredCountry}
            </span>
          )}
        </div>
        <output className="selectedCountry" aria-live="polite">
          {activeCountry}
        </output>
        {region === "pacific" && (
          <section className="islandFinder" aria-labelledby="pacific-island-title">
            <div>
              <strong id="pacific-island-title">Pacific island finder</strong>
              <span>Choose islands too small to display clearly on the map.</span>
            </div>
            <div className="islandOptions">
              {pacificOptions.map(([code, name]) => (
                <button type="button" key={code} aria-pressed={activeCode === code}
                  onClick={() => selectCountry(code)}>{name}</button>
              ))}
            </div>
          </section>
        )}
        {onCountrySelect && (
          <div className="mapGuessControls">
            {guessingMessage && <p className="mapGuessNotice" role="status">{guessingMessage}</p>}
            <label htmlFor="map-country-guess">Or choose by name</label>
            <select id="map-country-guess" value={activeCode || ""} disabled={guessingDisabled}
              onChange={(event) => {
                const code = event.target.value;
                setActiveCode(code || null);
                setActiveCountry(code ? countryNames.get(code) : "Select a country");
                setPointer(null);
              }}>
              <option value="">Select a country</option>
              {countryOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <button type="button" className="mapGuessButton"
              disabled={!activeCode || submitting || guessingDisabled}
              onClick={() => onCountrySelect(activeCode)}>
              {activeCode ? `Guess ${activeCountry}` : "Select a country to guess"}
            </button>
          </div>
        )}
      </section>
    </Overlay>
  );
};

export default WorldMap;
