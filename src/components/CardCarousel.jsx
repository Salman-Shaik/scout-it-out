import React, { useState } from "react";
import "./css/CardCarousel.css";
import Card from "./Card";
import Overlay from "./Overlay";
import InfoButton from "./InfoButton";
import Player from "../model/Player";

const CardCarousel = ({ items, players, setPlayers, setIsNewGame }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState("default");
  const [isFlagMode, setIsFlagMode] = useState(false);
  const [disableNext, setDisableNext] = useState(true);
  const [winner, setWinner] = useState("");
  const [showQuitConfirmation, setShowQuitConfirmation] = useState(false);

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
    const winningPlayer = updatedPlayers.find((player) => player.isWinner());
    if (winningPlayer) setWinner(winningPlayer.getName());
  };

  const selectPlayer = ({ target }) => {
    setSelectedPlayer(target.value);
    setDisableNext(false);
  };

  if (winner) {
    return (
      <Overlay showOverlay>
        <section className="winningOverlay">
          <span className="section-kicker">Trail completed</span>
          <h1 className="winnerMessage">🎉 {winner} wins! 🎊</h1>
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
            <span className="section-kicker">End this game?</span>
            <h2 id="quit-title">Your current scores will be cleared.</h2>
            <p>You’ll return to the lobby and can start again with a new crew.</p>
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
                onClick={() => setIsNewGame(true)}
              >
                Quit game
              </button>
            </div>
          </section>
        </Overlay>
      )}
      <div className="gameToolbar">
        <span>Game in progress</span>
        <button
          className="quitGameButton"
          type="button"
          onClick={() => setShowQuitConfirmation(true)}
        >
          Quit game
        </button>
      </div>
      <div className="gameLayout">
        <InfoButton players={players} />
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
