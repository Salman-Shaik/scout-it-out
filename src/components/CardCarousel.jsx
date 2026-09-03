import React, { lazy, Suspense, useState } from "react";
import "./css/CardCarousel.css";
import Card from "./Card";
import Overlay from "./Overlay";
import InfoButton from "./InfoButton";
import Player from "../model/Player";

const WorldMap = lazy(() => import("./WorldMap"));

const CardCarousel = ({
  items,
  players,
  setPlayers,
  setIsNewGame,
  winTarget = 7,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState("default");
  const [isFlagMode, setIsFlagMode] = useState(false);
  const [disableNext, setDisableNext] = useState(true);
  const [winner, setWinner] = useState("");
  const [showQuitConfirmation, setShowQuitConfirmation] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const isEndless = winTarget === null;

  const handleNextCard = () => {
    setCurrentIndex((index) => Math.min(index + 1, items.length - 1));
    const updatedPlayers = players.map((player) =>
      player.getName() === selectedPlayer
        ? new Player(player.getName(), player.getScore() + 1)
        : player,
    );
    setPlayers(updatedPlayers);
    setDisableNext(true);
    setSelectedPlayer("default");
    const winningPlayer = updatedPlayers.find((player) =>
      player.isWinner(winTarget),
    );
    if (winningPlayer) setWinner(winningPlayer.getName());
  };

  const selectPlayer = ({ target }) => {
    setSelectedPlayer(target.value);
    setDisableNext(false);
  };

  if (winner || gameEnded) {
    return (
      <Overlay showOverlay>
        <section className="winningOverlay">
          <span className="section-kicker">
            {winner ? "Trail completed" : "Game completed"}
          </span>
          <h1 className="winnerMessage">
            {winner ? `🎉 ${winner} wins! 🎊` : "Great scouting!"}
          </h1>
          <h2>Final scores</h2>
          {players.map((player) => (
            <h4 key={player.getName()}>
              {player.getName()}: {player.getScore()}
            </h4>
          ))}
          <button className="closeOverlay" onClick={() => setIsNewGame(true)}>
            Start a new game
          </button>
        </section>
      </Overlay>
    );
  }

  return (
    <div className="card-assembly">
      {showQuitConfirmation && (
        <Overlay showOverlay>
          <section className="quitOverlay" aria-labelledby="quit-title">
            <span className="section-kicker">End this Endless game?</span>
            <h2 id="quit-title">Your current scores will be cleared.</h2>
            <p>
              Your final scores will be shown before you return to the lobby.
            </p>
            <div className="quitActions">
              <button
                className="cancelQuit"
                type="button"
                onClick={() => setShowQuitConfirmation(false)}
              >
                Keep playing
              </button>
              <button
                className="confirmQuit"
                type="button"
                onClick={() => {
                  setShowQuitConfirmation(false);
                  setGameEnded(true);
                }}
              >
                End game
              </button>
            </div>
          </section>
        </Overlay>
      )}
      {showWorldMap && (
        <Suspense fallback={<div className="mapLoading">Loading map…</div>}>
          <WorldMap countries={items} onClose={() => setShowWorldMap(false)} />
        </Suspense>
      )}
      <div className="gameToolbar">
        <span>Game in progress</span>
        <div className="gameToolbarActions">
          <button
            className="worldMapButton"
            type="button"
            onClick={() => setShowWorldMap(true)}
          >
            World map
          </button>
          {isEndless && (
            <button
              className="quitGameButton"
              type="button"
              onClick={() => setShowQuitConfirmation(true)}
            >
              End game
            </button>
          )}
        </div>
      </div>
      <div className="gameLayout">
        <InfoButton players={players} winTarget={winTarget} />
        <main className="playArea">
          <div className="roundMeta">
            <span>Country card</span>
            <strong>
              {currentIndex + 1} <span>/ {items.length}</span>
            </strong>
          </div>
          <div className="card-container">
            {items.map((item, index) => (
              <div
                key={item.country_code}
                className={`cards ${index === currentIndex ? "active" : "hidden"}`}
              >
                <Card
                  info={item}
                  isFlagMode={isFlagMode}
                  setIsFlagMode={setIsFlagMode}
                />
              </div>
            ))}
          </div>
        </main>
      </div>
      {!isFlagMode && (
        <div className="card-controls">
          <label htmlFor="round-winner">Who guessed it?</label>
          <select
            id="round-winner"
            className="player-dropdown"
            onChange={selectPlayer}
            value={selectedPlayer}
          >
            <option value="default" disabled>
              Select a player
            </option>
            {players.map((player) => (
              <option key={player.getName()} value={player.getName()}>
                {player.getName()}
              </option>
            ))}
          </select>
          <button
            className="next"
            onClick={handleNextCard}
            disabled={disableNext}
          >
            Award point &amp; continue <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default CardCarousel;
