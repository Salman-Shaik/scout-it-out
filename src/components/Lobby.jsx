import React, { useState } from "react";
import "./css/Lobby.css"; // Import CSS styles
import Player from "../model/Player";

const WIN_OPTIONS = [3, 5, 7, 10, "endless"];

const Lobby = ({ setPlayerState, setIsNewGame, setWinTarget }) => {
  const [players, setPlayers] = useState([]);
  const [playerName, setPlayerName] = useState("");
  const [selectedTarget, setSelectedTarget] = useState(7);

  const addPlayer = () => {
    if (playerName.trim()) {
      // Handle duplicate player names gracefully
      const baseName = playerName.trim();
      let uniqueName = baseName;
      let suffix = 2;
      while (players.some((player) => player.name === uniqueName)) {
        uniqueName = `${baseName} (${suffix})`;
        suffix += 1;
      }
      setPlayers([...players, { name: uniqueName, score: 0 }]);
      setPlayerName("");
    }
  };

  const removePlayer = (name) => {
    setPlayers(players.filter((player) => player.name !== name));
  };

  const handleStartGame = () => {
    // Perform necessary actions to start the game (e.g., redirect to game page)
    const playerObjects = players.map((player) => new Player(player.name));
    setPlayerState(playerObjects);
    setWinTarget(selectedTarget === "endless" ? null : selectedTarget);
    setIsNewGame(false);
    alert(
      "Game starting with players: " +
        players.map((player) => player.name).join(", "),
    );
  };

  return (
    <div className="lobbyContainer">
      <div className="lobbyIntro">
        <span className="section-kicker">Ready to roam?</span>
        <h2>Build your scout crew</h2>
        <p>Add 3–13 players, then choose how long you want to play.</p>
      </div>
      <form
        className="playerInput"
        onSubmit={(event) => {
          event.preventDefault();
          addPlayer();
        }}
      >
        <label className="sr-only" htmlFor="player-name">
          Player name
        </label>
        <input
          id="player-name"
          type="text"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Enter Player Name"
          className="playerNameInput"
        />
        <button
          type="submit"
          className="addButton"
          aria-label="Add player"
          disabled={players.length === 13}
        >
          <span aria-hidden="true">+</span>
          <span className="addButtonLabel">Add player</span>
        </button>
      </form>
      <div className="playerListHeader">
        <h3>Your players</h3>
        <span>{players.length}/13</span>
      </div>
      <div className="playerList">
        {players.length === 0 && (
          <p className="emptyPlayers">Your crew will appear here.</p>
        )}
        {players.map((player) => (
          <span key={player.name} className="playerListItem">
            {player.name}
            <button
              type="button"
              onClick={() => removePlayer(player.name)}
              className="removeButton"
              aria-label={`Remove ${player.name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <fieldset className="winCriteria">
        <legend>Choose the win criteria</legend>
        <div className="winOptions">
          {WIN_OPTIONS.map((target) => (
            <label
              className={selectedTarget === target ? "selected" : ""}
              key={target}
            >
              <input
                type="radio"
                name="win-target"
                value={target}
                checked={selectedTarget === target}
                onChange={() => setSelectedTarget(target)}
              />
              <strong>{target === "endless" ? "Endless" : target}</strong>
              <span>{target === "endless" ? "End when ready" : "to win"}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        onClick={handleStartGame}
        className="startGameButton"
        disabled={players.length < 3}
      >
        Start exploring <span aria-hidden="true">→</span>
      </button>
    </div>
  );
};

export default Lobby;
