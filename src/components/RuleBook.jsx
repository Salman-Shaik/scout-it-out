import React from "react";
import Overlay from "./Overlay";
import "./css/RuleBook.css";

const RuleBook = ({ onClose, multiplayer = false }) => (
  <Overlay showOverlay>
    <article className="ruleBook" aria-labelledby="rulebook-title">
      <header className="ruleBookHeader">
        <div>
          <span className="section-kicker">New scout briefing</span>
          <h2 id="rulebook-title">How to play</h2>
        </div>
        <button type="button" className="ruleBookClose" onClick={onClose}>
          Close rules
        </button>
      </header>

      <p className="ruleBookLead">
        {multiplayer
          ? "Join one room on separate devices. One scout holds the secret card while everyone else guesses."
          : "Listen closely, guess the mystery country, and collect points before your fellow scouts do."}
      </p>

      {multiplayer && (
        <section className="winningRules" aria-label="Shared device rules">
          <h3>Playing on separate screens</h3>
          <p>
            The host creates a room and shares its code. At least three scouts
            join before the host starts. Enter each player's age: the oldest
            scout holds the first card. One guesser at a time rolls the die
            once. Their screen shows the matching clue; the holder reads it
            aloud, while the other guessers scout the map. If nobody guesses,
            the holder passes the turn. A correct guess earns a card and a
            bonus token, then the card holder rotates.
          </p>
        </section>
      )}

      <ol className="ruleSteps">
        <li>
          <strong>Build your crew</strong>
          <span>Add 3–13 players and choose 3, 5, 7, 10, or Endless.</span>
        </li>
        <li>
          <strong>Choose a clue reader</strong>
          <span>
            {multiplayer
              ? "The card holder keeps the secret answer on their screen and reads clues aloud."
              : "One player controls the device and keeps the country answer hidden from everyone guessing."}
          </span>
        </li>
        <li>
          <strong>Read the clues in order</strong>
          <span>
            {multiplayer
              ? "Guessers roll a digital die; the card holder reads the matching numbered clue."
              : "Begin with clue one and reveal another when nobody guesses correctly. The clues become more challenging."}
          </span>
        </li>
        <li>
          <strong>Use the extra hints</strong>
          <span>
            {multiplayer
              ? "On your rolling turn, spend at most one earned token to see the flag, bonus word, continent, or re-roll."
              : "Open the world map, show the flag, or read the continent and challenge clue when the group needs help."}
          </span>
        </li>
        <li>
          <strong>Award the point</strong>
          <span>
            Select the first player to name the country correctly, award their
            {multiplayer ? " card and bonus token" : " point"}, then move to a fresh card.
          </span>
        </li>
        <li>
          <strong>Pass the device</strong>
          <span>
            {multiplayer
              ? "The card holder rotates automatically after each country."
              : "Rotate the clue-reader role after each country so everyone gets a turn reading and guessing."}
          </span>
        </li>
      </ol>

      <section className="winningRules" aria-labelledby="winning-rules-title">
        <h3 id="winning-rules-title">Winning the game</h3>
        <p>
          In a scored game, the first player to reach the selected target wins.
          In Endless mode, choose <strong>End game</strong> when ready; the
          highest score wins, and tied leaders share the victory.
        </p>
        <p>
          <strong>Quit game</strong> abandons any mode without declaring a
          winner. {multiplayer && "Only the room host can close a shared game."}
        </p>
      </section>

      <footer className="ruleBookSource">
        <strong>Based on the official tabletop game</strong>
        <span>
          The original uses a die, country cards, maps, and bonus tokens. This
          digital edition adapts that play loop to the controls above.
        </span>
        <a
          href="https://www.skillmaticscardgame.com/product/skillmatics-board-game-scout-it-out-guessing-trivia-game-for-families-educational-toys-card-games-for-kids-teens-and-adults-gifts-for-boys-and-girls-ages-7-8-9-and-upcountries-of-the-world/"
          target="_blank"
          rel="noreferrer"
        >
          View the official Skillmatics game
        </a>
      </footer>
    </article>
  </Overlay>
);

export default RuleBook;
