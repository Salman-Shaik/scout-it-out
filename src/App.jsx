import React, { useEffect, useState } from "react";
import CardCarousel from "./components/CardCarousel";
import Lobby from "./components/Lobby";
import "./App.css";
import countryData from "./data/countries_info.json";
import Player from "./model/Player";
import RuleBook from "./components/RuleBook";

const STORAGE_KEY = "scoutItOutPlayers";
const THEME_KEY = "scoutItOutTheme";
const WIN_TARGET_KEY = "scoutItOutWinTarget";
const VALID_WIN_TARGETS = [3, 5, 7, 10, null];

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
};

const loadPlayers = () => {
  try {
    const savedPlayers = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return savedPlayers.map(Player.fromJson);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

const loadWinTarget = () => {
  try {
    const savedValue = localStorage.getItem(WIN_TARGET_KEY);
    if (savedValue === null) return 7;
    const savedTarget = JSON.parse(savedValue);
    return VALID_WIN_TARGETS.includes(savedTarget) ? savedTarget : 7;
  } catch {
    localStorage.removeItem(WIN_TARGET_KEY);
    return 7;
  }
};

function App() {
  const [info, setInfo] = useState(() => shuffle(countryData));
  const [players, setPlayers] = useState(loadPlayers);
  const [isNewGame, setIsNewGame] = useState(() => loadPlayers().length === 0);
  const [winTarget, setWinTarget] = useState(loadWinTarget);
  const [theme, setTheme] = useState(getInitialTheme);
  const [showRuleBook, setShowRuleBook] = useState(false);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(players.map((player) => player.toJson())),
    );
  }, [players]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(WIN_TARGET_KEY, JSON.stringify(winTarget));
  }, [winTarget]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  const setGameState = (showLobby) => {
    if (showLobby) {
      setPlayers([]);
      localStorage.removeItem(STORAGE_KEY);
    } else {
      setInfo(shuffle(countryData));
    }
    setIsNewGame(showLobby);
  };

  return (
    <div className="App" data-theme={theme}>
      <header className="App-header">
        <div className="brand-mark" aria-hidden="true">
          ✦
        </div>
        <div className="brand-copy">
          <span className="brand-eyebrow">The country guessing game</span>
          <h1>Scout It Out</h1>
        </div>
        <div className="header-actions">
          <button
            className="rulesButton"
            type="button"
            onClick={() => setShowRuleBook(true)}
          >
            How to play
          </button>
          <span className="country-count">195 countries</span>
          <button
            className="theme-toggle"
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={toggleTheme}
          >
            <span className="theme-toggle-track" aria-hidden="true">
              <span className="theme-toggle-icon theme-toggle-sun">☀</span>
              <span className="theme-toggle-icon theme-toggle-moon">☾</span>
              <span className="theme-toggle-thumb" />
            </span>
          </button>
        </div>
      </header>
      {showRuleBook && <RuleBook onClose={() => setShowRuleBook(false)} />}
      {isNewGame ? (
        <section>
          <Lobby
            setPlayerState={setPlayers}
            setIsNewGame={setGameState}
            setWinTarget={setWinTarget}
          />
        </section>
      ) : (
        <section className="app_section">
          <CardCarousel
            items={info}
            players={players}
            setPlayers={setPlayers}
            setIsNewGame={setGameState}
            winTarget={winTarget}
          />
        </section>
      )}
    </div>
  );
}

export default App;
