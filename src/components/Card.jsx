import React from "react";
import "flag-icons/css/flag-icons.min.css";
import "./css/Card.css";
import Overlay from "./Overlay";

const Card = ({ info, isFlagMode, setIsFlagMode }) => {
  const closeOverlay = () => {
    setIsFlagMode(false);
  };

  const onFlag = () => {
    setIsFlagMode(true);
  };

  return isFlagMode ? (
    <Overlay showOverlay={isFlagMode}>
      <div className="flagReveal">
        <span className="revealKicker">Flag reveal</span>
        <h2>Which country is it?</h2>
        <span
          className={`fi fi-${info.country_code} revealFlag`}
          role="img"
          aria-label="Mystery country flag"
        ></span>
        <button className="closeOverlay" onClick={closeOverlay}>
          Back to clues
        </button>
      </div>
    </Overlay>
  ) : (
    <div className="card">
      <button className="flagButton" onClick={onFlag} aria-label="Show flag">
        <span aria-hidden="true">Reveal flag</span>
        <span aria-hidden="true">↗</span>
      </button>
      <div className="cardHeading">
        <span className="cardKicker">Mystery country</span>
        <h3 className="card_title">{info.answer}</h3>
      </div>
      <section className="card_clues">
        <span className="clueLabel">Follow the trail</span>
        <ol>
          {info.clues.map((clue, index) => (
            <li key={clue} data-number={String(index + 1).padStart(2, "0")}>
              {clue}
            </li>
          ))}
        </ol>
      </section>
      <section className="card_bonus">
        <p className="bonus_text continent">
          <span>Continent</span>
          {info.continent}
        </p>
        <p className="bonus_text buzzword">
          <span>Challenge clue</span>
          {info.buzzword}
        </p>
      </section>
    </div>
  );
};

export default Card;
