import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import countryData from "../data/countries_info.json";
import "flag-icons/css/flag-icons.min.css";
import { ensureAnonymousUser, rpc, shuffleCodes, supabase } from "./client";
import "./Multiplayer.css";

const SESSION_KEY = "scoutItOutRoom";
const WorldMap = lazy(() => import("../components/WorldMap"));
const countryByCode = new Map(
  countryData.map((country) => [country.country_code, country]),
);
const TARGETS = [3, 5, 7, 10, "endless"];
const TOKEN_TYPES = [
  ["flag", "See flag", "flag_tokens"],
  ["buzzword", "Bonus word", "buzzword_tokens"],
  ["continent", "Continent", "continent_tokens"],
  ["reroll", "Re-roll die", "reroll_tokens"],
];
const tokenSummary = (player) => TOKEN_TYPES
  .filter(([, , field]) => (player[field] || 0) > 0)
  .map(([, label, field]) => `${label} ×${player[field]}`)
  .join(" · ") || "No tokens";

const formatRemaining = (seconds) => {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
};

const Multiplayer = () => {
  const [user, setUser] = useState(null);
  const [connecting, setConnecting] = useState(true);
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  });
  const [availability, setAvailability] = useState(null);
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [deck, setDeck] = useState(null);
  const [turnCode, setTurnCode] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const [playerAge, setPlayerAge] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [target, setTarget] = useState(5);
  const [selectedGuesser, setSelectedGuesser] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [showMap, setShowMap] = useState(false);
  const refreshPromiseRef = useRef(null);
  const refreshQueuedRef = useRef(false);

  const loadGame = useCallback(async () => {
    if (!session) return;
    const [gameResult, playerResult] = await Promise.all([
      supabase.from("games").select("*").eq("id", session.gameId).maybeSingle(),
      supabase.from("game_players").select("*").eq("game_id", session.gameId)
        .order("joined_at").order("id"),
    ]);
    const { data: gameData, error: gameError } = gameResult;
    if (gameError) throw gameError;
    if (!gameData) {
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
      setGame(null);
      setPlayers([]);
      setDeck(null);
      setTurnCode(null);
      setError("This room has ended or expired.");
      return;
    }
    const { data: playerData, error: playerError } = playerResult;
    if (playerError) throw playerError;
    setGame(gameData);
    setPlayers(playerData || []);

    if (gameData.card_holder_user_id === user?.id) {
      const { data: secret, error: secretError } = await supabase
        .from("game_secrets")
        .select("country_codes")
        .eq("game_id", session.gameId)
        .maybeSingle();
      if (secretError) throw secretError;
      setDeck(secret?.country_codes || null);
    } else {
      setDeck(null);
    }
    if (gameData.clue_roll || gameData.bonus_type) {
      setTurnCode(await rpc("get_turn_card_code", { target_game_id: session.gameId }));
    } else {
      setTurnCode(null);
    }
  }, [session, user]);

  const fetchGame = useCallback(() => {
    if (!session) return Promise.resolve();
    if (refreshPromiseRef.current) {
      refreshQueuedRef.current = true;
      return refreshPromiseRef.current;
    }
    const refresh = (async () => {
      do {
        refreshQueuedRef.current = false;
        await loadGame();
      } while (refreshQueuedRef.current);
    })();
    refreshPromiseRef.current = refresh.finally(() => {
      refreshPromiseRef.current = null;
    });
    return refreshPromiseRef.current;
  }, [loadGame, session]);

  const connect = useCallback(() => {
    setConnecting(true);
    setError("");
    ensureAnonymousUser()
      .then(setUser)
      .catch((failure) => setError(
        failure.message === "Failed to fetch"
          ? "Cannot reach Supabase. Check the project URL, publishable key, and internet connection."
          : failure.message,
      ))
      .finally(() => setConnecting(false));
  }, []);

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user || session) return;
    rpc("game_availability")
      .then(setAvailability)
      .catch((failure) => setError(failure.message));
  }, [user, session]);

  useEffect(() => {
    if (!user || !session) return;
    fetchGame().catch((failure) => setError(failure.message));
    const channel = supabase
      .channel(`game:${session.gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        (change) => {
          if (
            change.new?.id === session.gameId ||
            change.old?.id === session.gameId
          )
            fetchGame().catch((failure) => setError(failure.message));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_players" },
        (change) => {
          if (change.new?.game_id === session.gameId)
            fetchGame().catch((failure) => setError(failure.message));
        },
      )
      .subscribe();
    const poll = setInterval(() => {
      fetchGame().catch((failure) => setError(failure.message));
    }, 15000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [user, session, fetchGame]);

  const perform = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await fetchGame();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = (result) => {
    const nextSession = { gameId: result.game_id, playerId: result.player_id };
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };

  const createRoom = () =>
    perform(async () => {
      const result = await rpc("create_game", {
        player_name: playerName.trim(),
        player_age: Number(playerAge),
        target_score: target === "endless" ? null : target,
        shuffled_country_codes: shuffleCodes(countryData),
      });
      if (!result.available) {
        setAvailability(result);
        return;
      }
      enterRoom(result);
    });

  const joinRoom = () =>
    perform(async () => {
      const result = await rpc("join_game", {
        join_code: roomCode.trim().toUpperCase(),
        player_name: playerName.trim(),
        player_age: Number(playerAge),
      });
      enterRoom(result);
    });

  const cardHolder = players.find(
    (player) => player.user_id === game?.card_holder_user_id,
  );
  const myPlayer = players.find((player) => player.user_id === user?.id);
  const isHolder = Boolean(game && user) && game.card_holder_user_id === user.id;
  const isHost = Boolean(game && user) && game.host_user_id === user.id;
  const isRoller = Boolean(game && user) && game.turn_user_id === user.id;
  const roller = players.find((player) => player.user_id === game?.turn_user_id);
  const country = useMemo(() => {
    if (!isHolder || !deck || !game) return null;
    return countryByCode.get(deck[game.current_card_index]);
  }, [deck, game, isHolder]);
  const winners = players.filter((player) =>
    game?.winner_user_ids?.includes(player.user_id),
  );
  const recentRoll =
    game?.last_event?.type === "die_rolled" &&
    now - new Date(game.last_event.at).getTime() < 8000;
  const turnCountry = turnCode ? countryByCode.get(turnCode) : null;
  const bonusPlayer = players.find(
    (player) => player.user_id === game?.bonus_user_id,
  );
  const pendingGuesser = players.find(
    (player) => player.user_id === game?.pending_guess_user_id,
  );
  const pendingGuess = countryByCode.get(game?.pending_guess_code);
  const availableTokens = TOKEN_TYPES.filter(
    ([, , field]) => (myPlayer?.[field] || 0) > 0,
  );
  const hasMapGuessed = Boolean(game?.map_guess_user_ids?.includes(user?.id));

  useEffect(() => {
    setShowMap(false);
  }, [game?.turn_number]);

  if (!user) {
    return (
      <div className="multiPage">
        <h2>{connecting ? "Connecting to the game server…" : "Game server unavailable"}</h2>
        {error && <p role="alert">{error}</p>}
        {!connecting && <button type="button" onClick={connect}>Try again</button>}
      </div>
    );
  }

  return (
    <div className="multiPage">
      <div className="multiTop">
        <span>One shared game at a time</span>
      </div>
      {error && (
        <p className="multiError" role="alert">
          {error}
        </p>
      )}

      {!session && (
        <section className="multiPanel">
          <span className="section-kicker">Same room, separate screens</span>
          <h2>Play together</h2>
          <p>
            Create a room, share its six-character code, and let every player
            join on their own device.
          </p>
          <label htmlFor="multiplayer-name">Your player name</label>
          <input
            id="multiplayer-name"
            maxLength={30}
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
          />
          <label htmlFor="multiplayer-age">Your age (oldest player holds the first card)</label>
          <input id="multiplayer-age" type="number" min="7" max="120"
            value={playerAge} onChange={(event) => setPlayerAge(event.target.value)} />
          {availability && !availability.available && (
            <p className="multiBusy" role="status">
              Server busy. New games can start in about{" "}
              {formatRemaining(availability.retry_after_seconds)}. If you have
              the room code, you can still join the current lobby.
            </p>
          )}
          <fieldset className="multiTargets">
            <legend>Win criteria</legend>
            {TARGETS.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="multi-target"
                  checked={target === option}
                  onChange={() => setTarget(option)}
                />
                {option === "endless" ? "Endless" : `${option} to win`}
              </label>
            ))}
          </fieldset>
          <button
            className="multiPrimary"
            type="button"
            disabled={
              busy || !playerName.trim() || !playerAge || Number(playerAge) < 7 || Number(playerAge) > 120 || availability?.available === false
            }
            onClick={createRoom}
          >
            Create room
          </button>
          <div className="multiDivider">or join a room</div>
          <label htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            autoCapitalize="characters"
            maxLength={6}
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          />
          <button
            className="multiSecondary"
            type="button"
            disabled={busy || !playerName.trim() || !playerAge || Number(playerAge) < 7 || Number(playerAge) > 120 || roomCode.length !== 6}
            onClick={joinRoom}
          >
            Join room
          </button>
        </section>
      )}

      {session && game && (
        <>
          <section className="multiPanel">
            <div className="multiRoomHeader">
              <div>
                <span className="section-kicker">Room code</span>
                <h2>{game.room_code}</h2>
              </div>
              <strong>
                {game.win_target === null
                  ? "Endless"
                  : `First to ${game.win_target}`}
              </strong>
            </div>
            <p>
              Card holder: <strong>{cardHolder?.name || "Waiting…"}</strong>
              {isHolder && " (you)"}
            </p>
            <div className="multiPlayers" aria-label="Players and scores">
              {players.map((player) => (
                <div key={player.id}>
                  <span>{player.name}{player.user_id === game.turn_user_id && game.status === "active" ? " · rolling" : ""}</span>
                  <strong>{player.score} cards <small>{tokenSummary(player)}</small></strong>
                </div>
              ))}
            </div>
            {game.status === "lobby" && (
              <>
                <p>
                  Share this code. The host starts when at least three players
                  have joined.
                </p>
                {isHost && (
                  <button
                    className="multiPrimary"
                    type="button"
                    disabled={busy || players.length < 3}
                    onClick={() =>
                      perform(() =>
                        rpc("start_game", { target_game_id: game.id }),
                      )
                    }
                  >
                    Start shared game
                  </button>
                )}
              </>
            )}
          </section>

          {game.status === "active" && (
            <section className="multiPanel" aria-label="Current round">
              <span className="section-kicker">
                Country {game.current_card_index + 1}
              </span>
              {(game.clue_roll || game.token_used_this_turn || pendingGuess) && (
                <aside className="roundFeed" aria-label="Shared round updates" aria-live="polite">
                  <div className="roundFeedHeader">
                    <strong>Round updates</strong>
                    <span>Visible to everyone</span>
                  </div>
                  {game.clue_roll && (
                    <div className="roundUpdate">
                      <span>Clue {game.clue_roll}</span>
                      <p>{turnCountry?.clues?.[game.clue_roll - 1] || "Loading the revealed clue…"}</p>
                    </div>
                  )}
                  {game.token_used_this_turn && (
                    <div className="roundUpdate">
                      <span>{bonusPlayer?.name || "A player"} used {
                        TOKEN_TYPES.find(([kind]) => kind === game.bonus_type)?.[1] || "a token"
                      }</span>
                      {game.bonus_type === "flag" && turnCountry && (
                        <span className={`fi fi-${turnCountry.country_code} sharedBonusFlag`}
                          role="img" aria-label="Shared mystery flag" />
                      )}
                      {game.bonus_type === "buzzword" && <p>Bonus word: {turnCountry?.buzzword || "Loading…"}</p>}
                      {game.bonus_type === "continent" && <p>Continent: {turnCountry?.continent || "Loading…"}</p>}
                      {game.bonus_type === "reroll" && <p>The new roll is {game.clue_roll}.</p>}
                    </div>
                  )}
                  {pendingGuesser && pendingGuess && (
                    <div className="roundUpdate roundGuess">
                      <span>Map guess</span>
                      <p><strong>{pendingGuesser.name}</strong> guessed <strong>{pendingGuess.answer}</strong>.</p>
                      {isHolder && (
                        <div className="guessDecisionActions">
                          <button className="multiPrimary" type="button" disabled={busy || !game.clue_roll}
                            onClick={() => perform(() => rpc("award_point", {
                              target_game_id: game.id, guessed_user_id: pendingGuesser.user_id,
                            }))}>
                            Correct — award card
                          </button>
                          <button type="button" disabled={busy}
                            onClick={() => perform(() => rpc("reject_country_guess", { target_game_id: game.id }))}>
                            Not correct
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </aside>
              )}
              {isHolder ? (
                <>
                  <h3>You hold the card</h3>
                  <p>
                    Keep this screen hidden from guessers. When someone rolls,
                    read the clue matching the die number. Mark a correct guess or pass the turn.
                  </p>
                  {country ? (
                    <article className="holderCard">
                      <header className="holderCardHeader">
                        <div><span>Secret country</span><h4>{country.answer}</h4></div>
                        <span className={`fi fi-${country.country_code} holderFlag`}
                          role="img" aria-label="Current country flag" />
                      </header>
                      <ol className="holderClues">
                        {country.clues.map((clue, index) => (
                          <li
                            key={clue}
                            className={
                              recentRoll && game.last_event.roll === index + 1
                                ? "rolledClue"
                                : ""
                            }
                          >
                            {clue}
                          </li>
                        ))}
                      </ol>
                      <footer className="holderCardFooter">
                        <p><span>Continent</span>{country.continent}</p>
                        <p><span>Challenge clue</span>{country.buzzword}</p>
                      </footer>
                    </article>
                  ) : (
                    <p>Loading your secret card…</p>
                  )}
                  <p>Current roller: <strong>{roller?.name || "Waiting"}</strong></p>
                  {game.clue_roll && (
                    <p className="multiNotification" role="status">
                      {roller?.name} rolled {game.clue_roll}. Read clue {game.clue_roll} aloud.
                    </p>
                  )}
                  {recentRoll && (
                    <p className="multiNotification" role="status">
                      {game.last_event.player_name} rolled{" "}
                      {game.last_event.roll}! Read clue {game.last_event.roll}.
                    </p>
                  )}
                  <label htmlFor="guesser-select">First correct guesser</label>
                  <select
                    id="guesser-select"
                    value={selectedGuesser}
                    onChange={(event) => setSelectedGuesser(event.target.value)}
                  >
                    <option value="">Choose a player</option>
                    {players
                      .filter((player) => player.user_id !== user.id)
                      .map((player) => (
                        <option value={player.user_id} key={player.id}>
                          {player.name}
                        </option>
                      ))}
                  </select>
                  <div className="holderDecisionActions">
                  <button
                    className="multiPrimary"
                    type="button"
                    disabled={busy || !selectedGuesser || !country || !game.clue_roll}
                    onClick={() =>
                      perform(async () => {
                        await rpc("award_point", {
                          target_game_id: game.id,
                          guessed_user_id: selectedGuesser,
                        });
                        setSelectedGuesser("");
                      })
                    }
                  >
                    Correct guess: award card and token
                  </button>
                  <button type="button" disabled={busy || !game.clue_roll}
                    onClick={() => perform(() => rpc("pass_turn", { target_game_id: game.id }))}>
                    No correct guess: next roller
                  </button>
                  </div>
                </>
              ) : isRoller ? (
                <>
                  <h3>Your turn to roll</h3>
                  <p>
                    {cardHolder?.name} holds the card. Roll once, then wait for them to read the clue aloud.
                  </p>
                  <button
                    className="multiPrimary"
                    type="button"
                    disabled={busy || Boolean(game.clue_roll)}
                    onClick={() =>
                      perform(() =>
                        rpc("roll_die", { target_game_id: game.id }),
                      )
                    }
                  >
                    Roll digital die
                  </button>
                  {game.clue_roll && <p role="status">You rolled {game.clue_roll}. The clue is shared above.</p>}
                  <p>Use at most one of your earned tokens on this turn.</p>
                  {game.token_used_this_turn ? (
                    <p className="tokenStatus">Token used for this turn.</p>
                  ) : availableTokens.length ? (
                    <div className="multiBonusActions">
                    {availableTokens.map(([kind, label, field]) => {
                      const count = myPlayer?.[field] || 0;
                      return <button key={kind} type="button"
                        disabled={busy || count < 1 || game.token_used_this_turn || (kind === "reroll" && !game.clue_roll)}
                        onClick={() => perform(() => rpc("use_bonus_token", { target_game_id: game.id, help_type: kind }))}>
                        {label} <span aria-label={`${count} available`}>{count}</span>
                      </button>;
                    })}
                    </div>
                  ) : <p className="tokenStatus">No help tokens available yet.</p>}
                  <button type="button" onClick={() => setShowMap(true)}>Open world map</button>
                  {game.last_event?.type === "point_awarded" && (
                    <p role="status">
                      {game.last_event.player_name} earned a point!
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h3>Scout the map</h3>
                  <p>{roller?.name} is rolling now. Listen to the clue read aloud, look at the map, and call out your guess.</p>
                  <button type="button" onClick={() => setShowMap(true)}>Open world map</button>
                </>
              )}
            </section>
          )}

          {game.status === "finished" && (
            <section className="multiPanel" aria-label="Game results">
              <h3>Game complete</h3>
              <p>
                {winners.length > 0
                  ? `${winners.map((player) => player.name).join(" & ")} ${winners.length === 1 ? "wins" : "win"}!`
                  : "No winner was declared."}
              </p>
            </section>
          )}

          <section className="multiPanel multiExit">
            {isHost && game.status === "active" && game.win_target === null && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "End Endless game and declare the highest scorer?",
                    )
                  )
                    perform(() =>
                      rpc("finish_game", {
                        target_game_id: game.id,
                        abandon: false,
                      }),
                    );
                }}
              >
                End game
              </button>
            )}
            {isHost && game.status !== "finished" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Quit this shared game without a winner?"))
                    perform(() =>
                      rpc("finish_game", {
                        target_game_id: game.id,
                        abandon: true,
                      }),
                    );
                }}
              >
                Quit game
              </button>
            )}
            {game.status === "finished" && (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(SESSION_KEY);
                  setSession(null);
                  setGame(null);
                }}
              >
                Leave results
              </button>
            )}
          </section>
          <span className="sr-only">Signed in as {myPlayer?.name}</span>
          {showMap && <Suspense fallback={<p>Loading map…</p>}>
            <WorldMap countries={countryData} onClose={() => setShowMap(false)}
              submitting={busy}
              guessingDisabled={hasMapGuessed || Boolean(game.pending_guess_user_id) || !game.clue_roll}
              guessingMessage={hasMapGuessed
                ? "You have used your one map guess for this turn."
                : game.pending_guess_user_id
                  ? "Wait while the card holder reviews the current guess."
                  : !game.clue_roll ? "Wait for the clue before submitting a guess." : ""}
              onCountrySelect={isHolder ? undefined : (countryCode) => perform(async () => {
                await rpc("submit_country_guess", {
                  target_game_id: game.id,
                  country_code: countryCode,
                });
                setShowMap(false);
              })} />
          </Suspense>}
        </>
      )}
    </div>
  );
};

export default Multiplayer;
