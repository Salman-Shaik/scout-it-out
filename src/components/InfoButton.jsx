import React from "react";
import "./css/InfoButton.css";

const InfoButton = ({ players }) => {
  return (
    <aside className="scorePanel" aria-label="Scoreboard">
      <div className="scorePanelHeader">
        <span>Scoreboard</span>
        <span className="scoreTarget">First to 7</span>
      </div>
      <div className="scoreList">
        {players.map((player, index) => (
          <div className="scoreRow" key={player.getName()}>
            <span className="playerAvatar" aria-hidden="true">
              {index + 1}
            </span>
            <span className="scoreName">{player.getName()}</span>
            <strong>{player.getScore()}</strong>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default InfoButton;
