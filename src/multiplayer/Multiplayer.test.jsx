import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Multiplayer from "./Multiplayer";
import { ensureAnonymousUser, rpc, supabase } from "./client";

vi.mock("./client", () => ({
  ensureAnonymousUser: vi.fn(),
  rpc: vi.fn(),
  shuffleCodes: vi.fn(() => Array.from({ length: 195 }, (_, i) => `c${i}`)),
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));
vi.mock("../components/WorldMap", () => ({
  default: ({ onClose }) => <div role="dialog" aria-label="World map"><button onClick={onClose}>Close map</button></div>,
}));

const USER_ID = "user-a";
const GAME_ID = "game-one";
const defaultPlayers = [
  { id: "player-a", user_id: USER_ID, name: "Ada", age: 40, score: 0, bonus_tokens: 0 },
  { id: "player-b", user_id: "user-b", name: "Grace", age: 35, score: 0, bonus_tokens: 0 },
  { id: "player-c", user_id: "user-c", name: "Linus", age: 30, score: 0, bonus_tokens: 0 },
];

let game;
let players;
let roomSecret;
let listeners;

const gameRow = (overrides = {}) => ({
  id: GAME_ID,
  room_code: "A1B2C3",
  host_user_id: USER_ID,
  status: "lobby",
  win_target: 5,
  card_holder_user_id: USER_ID,
  turn_user_id: "user-b",
  clue_roll: null,
  token_used_this_turn: false,
  bonus_type: null,
  bonus_user_id: null,
  current_card_index: 0,
  last_event: {},
  winner_user_ids: [],
  expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
  ...overrides,
});

const roomSession = () =>
  localStorage.setItem(
    "scoutItOutRoom",
    JSON.stringify({ gameId: GAME_ID, playerId: "player-a" }),
  );

beforeEach(() => {
  game = null;
  players = [...defaultPlayers];
  roomSecret = { country_codes: ["sn", ...Array(194).fill("fr")] };
  listeners = [];
  ensureAnonymousUser.mockResolvedValue({ id: USER_ID });
  rpc.mockImplementation(async (name) => {
    if (name === "game_availability")
      return { available: true, retry_after_seconds: 0 };
    return null;
  });
  supabase.from.mockImplementation((table) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      maybeSingle: async () => ({
        data: table === "games" ? game : roomSecret,
        error: null,
      }),
      then: (resolve) =>
        Promise.resolve({ data: players, error: null }).then(resolve),
    };
    return query;
  });
  supabase.channel.mockImplementation(() => {
    const channel = {
      on: (_kind, filter, callback) => {
        listeners.push({ table: filter.table, callback });
        return channel;
      },
      subscribe: () => channel,
    };
    return channel;
  });
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

test("creates a room and exposes its join code", async () => {
  const user = userEvent.setup();
  rpc.mockImplementation(async (name) => {
    if (name === "game_availability") return { available: true };
    if (name === "create_game") {
      game = gameRow();
      return { available: true, game_id: GAME_ID, player_id: "player-a" };
    }
    return null;
  });
  render(<Multiplayer />);

  await user.type(await screen.findByLabelText("Your player name"), "Ada");
  await user.type(screen.getByLabelText(/your age/i), "40");
  await user.click(screen.getByRole("button", { name: "Create room" }));
  expect(await screen.findByText("A1B2C3")).toBeInTheDocument();
  expect(screen.getByText(/card holder:/i)).toHaveTextContent("Ada");
  expect(
    screen.getByRole("button", { name: "Start shared game" }),
  ).toBeEnabled();
  expect(JSON.parse(localStorage.getItem("scoutItOutRoom"))).toEqual({
    gameId: GAME_ID,
    playerId: "player-a",
  });
});

test("shows a server-busy retry estimate and allows joining by code", async () => {
  const user = userEvent.setup();
  rpc.mockImplementation(async (name) => {
    if (name === "game_availability")
      return { available: false, retry_after_seconds: 121 };
    if (name === "join_game") {
      game = gameRow();
      return { game_id: GAME_ID, player_id: "player-a" };
    }
    return null;
  });
  render(<Multiplayer />);

  await screen.findByText(/server busy/i);
  expect(screen.getByText(/3 minutes/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create room" })).toBeDisabled();
  await user.type(screen.getByLabelText("Your player name"), "Ada");
  await user.type(screen.getByLabelText(/your age/i), "40");
  await user.type(screen.getByLabelText("Room code"), "a1b2c3");
  await user.click(screen.getByRole("button", { name: "Join room" }));
  expect(await screen.findByText("A1B2C3")).toBeInTheDocument();
});

test("starts a shared game and card holder sees the secret card", async () => {
  const user = userEvent.setup();
  game = gameRow();
  roomSession();
  rpc.mockImplementation(async (name) => {
    if (name === "start_game") game = gameRow({ status: "active" });
    return null;
  });
  render(<Multiplayer />);

  await user.click(
    await screen.findByRole("button", { name: "Start shared game" }),
  );
  expect(await screen.findByText("You hold the card")).toBeInTheDocument();
  expect(screen.getByText("Senegal")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Current country flag" })).toBeInTheDocument();
  expect(screen.queryByText(/time remaining/i)).toBeNull();
  expect(screen.getByRole("button", { name: /award card and token/i })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: /roll digital die/i }),
  ).toBeNull();
});

test("card holder receives a recent die-roll notification and awards a point", async () => {
  const user = userEvent.setup();
  game = gameRow({
    status: "active",
    clue_roll: 2,
    last_event: {
      type: "die_rolled",
      player_name: "Grace",
      roll: 2,
      at: new Date().toISOString(),
    },
  });
  roomSession();
  rpc.mockImplementation(async (name) => {
    if (name === "award_point") {
      players = players.map((player) =>
        player.user_id === "user-b" ? { ...player, score: 1 } : player,
      );
      game = gameRow({
        status: "active",
        current_card_index: 1,
        card_holder_user_id: "user-b",
        turn_user_id: USER_ID,
        clue_roll: null,
        last_event: { type: "point_awarded", player_name: "Grace" },
      });
    }
    return null;
  });
  render(<Multiplayer />);

  await waitFor(() => expect(screen.getAllByRole("status").some((item) =>
    item.textContent.includes("Grace rolled 2! Read clue 2."))).toBe(true));
  await user.selectOptions(
    screen.getByLabelText("First correct guesser"),
    "user-b",
  );
  await user.click(screen.getByRole("button", { name: /award card and token/i }));
  expect(await screen.findByText("Your turn to roll")).toBeInTheDocument();
  expect(screen.queryByText("Senegal")).toBeNull();
});

test("guessers roll digitally and never see the answer", async () => {
  const user = userEvent.setup();
  game = gameRow({ status: "active", card_holder_user_id: "user-b", turn_user_id: USER_ID });
  roomSession();
  rpc.mockImplementation(async (name) => {
    if (name === "roll_die") {
      game = gameRow({
        status: "active",
        card_holder_user_id: "user-b",
        turn_user_id: USER_ID,
        clue_roll: 4,
        last_event: {
          type: "die_rolled",
          player_name: "Ada",
          roll: 4,
          at: new Date().toISOString(),
        },
      });
      return 4;
    }
    if (name === "get_turn_card_code") return "sn";
    return null;
  });
  render(<Multiplayer />);

  await user.click(
    await screen.findByRole("button", { name: "Roll digital die" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent("You rolled 4");
  expect(screen.queryByText("Senegal")).toBeNull();
  expect(screen.queryByRole("button", { name: /award point/i })).toBeNull();
});

test("shows tied winners after an Endless game ends", async () => {
  const user = userEvent.setup();
  game = gameRow({ status: "active", win_target: null });
  players = [
    { ...players[0], score: 3 },
    { ...players[1], score: 3 },
    { ...players[2], score: 1 },
  ];
  roomSession();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  rpc.mockImplementation(async (name) => {
    if (name === "finish_game") {
      game = gameRow({
        status: "finished",
        win_target: null,
        winner_user_ids: [USER_ID, "user-b"],
      });
    }
    return null;
  });
  render(<Multiplayer />);

  await user.click(await screen.findByRole("button", { name: "End game" }));
  const results = await screen.findByLabelText("Game results");
  expect(within(results).getByText("Ada & Grace win!")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Leave results" })).toBeEnabled();
  vi.restoreAllMocks();
});

test("removes an expired room session without showing a secret", async () => {
  roomSession();
  render(<Multiplayer />);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(/ended or expired/i),
  );
  expect(localStorage.getItem("scoutItOutRoom")).toBeNull();
});

test("a busy create attempt reports the current room wait time", async () => {
  const user = userEvent.setup();
  rpc.mockImplementation(async (name) => {
    if (name === "game_availability") return { available: true };
    if (name === "create_game")
      return { available: false, retry_after_seconds: 300 };
    return null;
  });
  render(<Multiplayer />);
  await user.type(await screen.findByLabelText("Your player name"), "Ada");
  await user.type(screen.getByLabelText(/your age/i), "40");
  await user.click(screen.getByRole("button", { name: "Create room" }));
  expect(await screen.findByText(/5 minutes/i)).toBeInTheDocument();
  expect(screen.queryByText("A1B2C3")).toBeNull();
});

test("join errors are shown without storing a room session", async () => {
  const user = userEvent.setup();
  rpc.mockImplementation(async (name) => {
    if (name === "game_availability") return { available: true };
    if (name === "join_game") throw new Error("Room not found");
    return null;
  });
  render(<Multiplayer />);
  await user.type(await screen.findByLabelText("Your player name"), "Ada");
  await user.type(screen.getByLabelText(/your age/i), "40");
  await user.type(screen.getByLabelText("Room code"), "ZZZZZZ");
  await user.click(screen.getByRole("button", { name: "Join room" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Room not found");
  expect(localStorage.getItem("scoutItOutRoom")).toBeNull();
});

test("only a host with three players can start the lobby", async () => {
  game = gameRow({ host_user_id: "user-b" });
  players = players.slice(0, 2);
  roomSession();
  render(<Multiplayer />);
  await screen.findByText("A1B2C3");
  expect(
    screen.queryByRole("button", { name: "Start shared game" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Quit game" })).toBeNull();
});

test("host quitting clears the shared room without declaring a winner", async () => {
  const user = userEvent.setup();
  game = gameRow({ status: "active" });
  roomSession();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  rpc.mockImplementation(async (name, parameters) => {
    if (name === "finish_game" && parameters.abandon) game = null;
    return null;
  });
  render(<Multiplayer />);
  await user.click(await screen.findByRole("button", { name: "Quit game" }));
  await waitFor(() =>
    expect(localStorage.getItem("scoutItOutRoom")).toBeNull(),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/ended or expired/i);
  vi.restoreAllMocks();
});

test("leaving finished results returns to the create/join screen", async () => {
  const user = userEvent.setup();
  game = gameRow({ status: "finished", winner_user_ids: [USER_ID] });
  roomSession();
  render(<Multiplayer />);
  await user.click(
    await screen.findByRole("button", { name: "Leave results" }),
  );
  expect(
    await screen.findByRole("button", { name: "Create room" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("scoutItOutRoom")).toBeNull();
});

test("live game events refresh a guesser's screen", async () => {
  game = gameRow({ status: "active", card_holder_user_id: "user-b", turn_user_id: USER_ID });
  roomSession();
  render(<Multiplayer />);
  await screen.findByText("Your turn to roll");
  game = gameRow({
    status: "active",
    card_holder_user_id: "user-b",
    turn_user_id: USER_ID,
    last_event: { type: "point_awarded", player_name: "Linus" },
  });
  listeners
    .find((listener) => listener.table === "games")
    .callback({
      new: { id: GAME_ID },
    });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Linus earned a point!",
  );
});

test("card holder sees no stale roll notification", async () => {
  game = gameRow({
    status: "active",
    last_event: {
      type: "die_rolled",
      player_name: "Grace",
      roll: 2,
      at: new Date(Date.now() - 20000).toISOString(),
    },
  });
  roomSession();
  render(<Multiplayer />);
  await screen.findByText("You hold the card");
  expect(screen.queryByRole("status")).toBeNull();
});

test("sign-in failures are shown before any room actions", async () => {
  ensureAnonymousUser.mockRejectedValue(new Error("Auth unavailable"));
  render(<Multiplayer />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Auth unavailable",
  );
  expect(screen.queryByRole("button", { name: "Create room" })).toBeNull();
});

test("a network failure explains the connection problem and can be retried", async () => {
  const user = userEvent.setup();
  ensureAnonymousUser.mockRejectedValueOnce(new Error("Failed to fetch"))
    .mockResolvedValueOnce({ id: USER_ID });
  render(<Multiplayer />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/cannot reach supabase/i);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "Create room" })).toBeInTheDocument();
});

test("malformed saved room state is discarded", async () => {
  localStorage.setItem("scoutItOutRoom", "bad json");
  render(<Multiplayer />);
  expect(
    await screen.findByRole("button", { name: "Create room" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("scoutItOutRoom")).toBeNull();
});

test("Endless target is sent as null when creating a room", async () => {
  const user = userEvent.setup();
  let capturedTarget = "unset";
  rpc.mockImplementation(async (name, parameters) => {
    if (name === "game_availability") return { available: true };
    if (name === "create_game") {
      capturedTarget = parameters.target_score;
      return { available: false, retry_after_seconds: 30 };
    }
    return null;
  });
  render(<Multiplayer />);
  await user.type(await screen.findByLabelText("Your player name"), "Ada");
  await user.type(screen.getByLabelText(/your age/i), "40");
  await user.click(screen.getByRole("radio", { name: "Endless" }));
  await user.click(screen.getByRole("button", { name: "Create room" }));
  expect(capturedTarget).toBeNull();
  expect(await screen.findByText(/1 minute/i)).toBeInTheDocument();
});

test("a two-player room leaves the host start action disabled", async () => {
  game = gameRow();
  players = players.slice(0, 2);
  roomSession();
  render(<Multiplayer />);
  expect(
    await screen.findByRole("button", { name: "Start shared game" }),
  ).toBeDisabled();
});

test("player and secret-load errors are surfaced to the room", async () => {
  game = gameRow({ status: "active" });
  roomSession();
  supabase.from.mockImplementation((table) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      maybeSingle: async () => ({
        data: table === "games" ? game : null,
        error:
          table === "game_secrets" ? new Error("Secret unavailable") : null,
      }),
      then: (resolve) =>
        Promise.resolve({ data: players, error: null }).then(resolve),
    };
    return query;
  });
  render(<Multiplayer />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Secret unavailable",
  );
});

test("missing secret card never enables awarding a point", async () => {
  game = gameRow({ status: "active" });
  roomSecret = { country_codes: ["unknown"] };
  roomSession();
  render(<Multiplayer />);
  await screen.findByText("You hold the card");
  expect(screen.getByText(/loading your secret card/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /award card and token/i })).toBeDisabled();
});

test("result screens without scored winners say no winner", async () => {
  game = gameRow({ status: "finished", winner_user_ids: [] });
  roomSession();
  render(<Multiplayer />);
  expect(
    await screen.findByText("No winner was declared."),
  ).toBeInTheDocument();
});

test("live player changes refresh the shared scoreboard", async () => {
  game = gameRow();
  roomSession();
  render(<Multiplayer />);
  await screen.findByText("A1B2C3");
  players = [
    ...players,
    { id: "player-d", user_id: "user-d", name: "Maya", score: 0 },
  ];
  listeners
    .find((listener) => listener.table === "game_players")
    .callback({
      new: { game_id: GAME_ID },
    });
  expect(await screen.findByText("Maya")).toBeInTheDocument();
});

test("cancelling a quit or end confirmation leaves the game active", async () => {
  const user = userEvent.setup();
  game = gameRow({ status: "active", win_target: null });
  roomSession();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Multiplayer />);
  await user.click(await screen.findByRole("button", { name: "End game" }));
  await user.click(screen.getByRole("button", { name: "Quit game" }));
  expect(rpc).not.toHaveBeenCalledWith("finish_game", expect.anything());
  expect(screen.getByText("You hold the card")).toBeInTheDocument();
  vi.restoreAllMocks();
});

test("room creation sends the player's age for oldest-holder selection", async () => {
  const user = userEvent.setup();
  rpc.mockImplementation(async (name) => name === "game_availability"
    ? { available: true } : { available: false, retry_after_seconds: 30 });
  render(<Multiplayer />);
  await user.type(await screen.findByLabelText("Your player name"), "Ada");
  await user.type(screen.getByLabelText(/your age/i), "48");
  await user.click(screen.getByRole("button", { name: "Create room" }));
  expect(rpc).toHaveBeenCalledWith("create_game", expect.objectContaining({
    player_age: 48,
  }));
});

test("a waiting guesser sees the map instead of dice or card", async () => {
  game = gameRow({ status: "active", card_holder_user_id: "user-b",
    turn_user_id: "user-c" });
  roomSession();
  render(<Multiplayer />);
  expect(await screen.findByRole("dialog", { name: "World map" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Roll digital die" })).toBeNull();
  expect(screen.queryByText("Senegal")).toBeNull();
});

test("current roller sees the rolled clue and cannot roll twice", async () => {
  const user = userEvent.setup();
  game = gameRow({ status: "active", card_holder_user_id: "user-b",
    turn_user_id: USER_ID });
  roomSession();
  rpc.mockImplementation(async (name) => {
    if (name === "roll_die") {
      game = gameRow({ status: "active", card_holder_user_id: "user-b",
        turn_user_id: USER_ID, clue_roll: 1 });
      return 1;
    }
    if (name === "get_turn_card_code") return "sn";
    return null;
  });
  render(<Multiplayer />);
  await user.click(await screen.findByRole("button", { name: "Roll digital die" }));
  expect(await screen.findByText(/clue 1:/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Roll digital die" })).toBeDisabled();
  expect(screen.queryByText("Senegal")).toBeNull();
});

test("bonus token can be spent once on the roller's turn", async () => {
  const user = userEvent.setup();
  players = players.map((player) => player.user_id === USER_ID
    ? { ...player, bonus_tokens: 1 } : player);
  game = gameRow({ status: "active", card_holder_user_id: "user-b",
    turn_user_id: USER_ID, clue_roll: 2 });
  roomSession();
  rpc.mockImplementation(async (name, parameters) => {
    if (name === "get_turn_card_code") return "sn";
    if (name === "use_bonus_token") {
      players = players.map((player) => player.user_id === USER_ID
        ? { ...player, bonus_tokens: 0 } : player);
      game = gameRow({ status: "active", card_holder_user_id: "user-b",
        turn_user_id: USER_ID, clue_roll: 2, token_used_this_turn: true,
        bonus_type: parameters.help_type, bonus_user_id: USER_ID });
    }
    return null;
  });
  render(<Multiplayer />);
  await user.click(await screen.findByRole("button", { name: /see flag.*1 token/i }));
  expect(await screen.findByRole("img", { name: "Mystery flag" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bonus word.*1 token/i })).toBeDisabled();
  expect(rpc).toHaveBeenCalledWith("use_bonus_token", expect.objectContaining({ help_type: "flag" }));
});

test("holder passes a turn after an unanswered clue", async () => {
  const user = userEvent.setup();
  game = gameRow({ status: "active", clue_roll: 3 });
  roomSession();
  rpc.mockImplementation(async (name) => {
    if (name === "pass_turn") game = gameRow({ status: "active", turn_user_id: "user-c" });
    return null;
  });
  render(<Multiplayer />);
  await user.click(await screen.findByRole("button", { name: /next roller/i }));
  expect(rpc).toHaveBeenCalledWith("pass_turn", { target_game_id: GAME_ID });
  expect(await screen.findByText(/current roller:/i)).toHaveTextContent("Linus");
});

test("joining a room sends age and lets the player edit it", async () => {
  const user = userEvent.setup();
  rpc.mockImplementation(async (name) => name === "game_availability"
    ? { available: true } : { game_id: GAME_ID, player_id: "player-a" });
  game = gameRow();
  render(<Multiplayer />);
  await user.type(await screen.findByLabelText("Your player name"), "Ada");
  await user.type(screen.getByLabelText(/your age/i), "41");
  await user.clear(screen.getByLabelText(/your age/i));
  await user.type(screen.getByLabelText(/your age/i), "42");
  await user.type(screen.getByLabelText("Room code"), "A1B2C3");
  await user.click(screen.getByRole("button", { name: "Join room" }));
  expect(rpc).toHaveBeenCalledWith("join_game", expect.objectContaining({ player_age: 42 }));
});

test("roller can spend a re-roll token after the first die roll", async () => {
  const user = userEvent.setup();
  players = players.map((player) => player.user_id === USER_ID
    ? { ...player, bonus_tokens: 1 } : player);
  game = gameRow({ status: "active", card_holder_user_id: "user-b",
    turn_user_id: USER_ID, clue_roll: 2 });
  roomSession();
  rpc.mockImplementation(async (name) => {
    if (name === "get_turn_card_code") return "sn";
    if (name === "use_bonus_token") {
      game = gameRow({ status: "active", card_holder_user_id: "user-b",
        turn_user_id: USER_ID, clue_roll: 5, token_used_this_turn: true,
        bonus_type: "reroll", bonus_user_id: USER_ID });
    }
    return null;
  });
  render(<Multiplayer />);
  await user.click(await screen.findByRole("button", { name: /re-roll die.*1 token/i }));
  expect(await screen.findByText(/you rolled 5/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /re-roll die.*1 token/i })).toBeDisabled();
});

test("roller may open and close the map without ending their turn", async () => {
  const user = userEvent.setup();
  game = gameRow({ status: "active", card_holder_user_id: "user-b", turn_user_id: USER_ID });
  roomSession();
  render(<Multiplayer />);
  await user.click(await screen.findByRole("button", { name: "Open world map" }));
  expect(await screen.findByRole("dialog", { name: "World map" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Close map" }));
  expect(screen.queryByRole("dialog", { name: "World map" })).toBeNull();
  expect(screen.getByRole("button", { name: "Roll digital die" })).toBeEnabled();
});

test.each([
  ["buzzword", "Bonus word", /bonus word:/i],
  ["continent", "Continent", /continent:/i],
])("roller receives %s token help only on their screen", async (kind, label, result) => {
  const user = userEvent.setup();
  players = players.map((player) => player.user_id === USER_ID
    ? { ...player, bonus_tokens: 1 } : player);
  game = gameRow({ status: "active", card_holder_user_id: "user-b",
    turn_user_id: USER_ID, clue_roll: 2 });
  roomSession();
  rpc.mockImplementation(async (name) => {
    if (name === "get_turn_card_code") return "sn";
    if (name === "use_bonus_token") game = gameRow({ status: "active",
      card_holder_user_id: "user-b", turn_user_id: USER_ID, clue_roll: 2,
      token_used_this_turn: true, bonus_type: kind, bonus_user_id: USER_ID });
    return null;
  });
  render(<Multiplayer />);
  await user.click(await screen.findByRole("button", { name: new RegExp(`${label}.*1 token`, "i") }));
  expect(await screen.findByText(result)).toBeInTheDocument();
});
