const json = (body, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const makeToken = (id) => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: id, role: "authenticated", aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  return `${header}.${payload}.mock-signature`;
};

const requestUser = (request) => {
  try {
    const token = request.headers().authorization.split(" ")[1];
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
  } catch { return null; }
};

export class MockGameServer {
  constructor() {
    this.game = null;
    this.players = [];
    this.deck = [];
    this.users = new Map();
    this.nextUser = 1;
    this.nextRoll = 1;
  }

  async install(context) {
    await context.route("**/auth/v1/**", (route) => this.auth(route));
    await context.route("**/rest/v1/**", (route) => this.rest(route));
  }

  async auth(route) {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/signup")) {
      const id = `mock-user-${this.nextUser++}`;
      const user = { id, aud: "authenticated", role: "authenticated",
        is_anonymous: true, app_metadata: { provider: "anonymous" },
        user_metadata: {}, identities: [] };
      this.users.set(id, user);
      return route.fulfill(json({ access_token: makeToken(id), token_type: "bearer",
        expires_in: 3600, refresh_token: `refresh-${id}`, user }));
    }
    if (path.endsWith("/user")) {
      const user = this.users.get(requestUser(request));
      return route.fulfill(json(user || { message: "No user" }, user ? 200 : 401));
    }
    return route.fulfill(json({ message: "Unsupported auth request" }, 404));
  }

  nextGuesser(current, holder) {
    const eligible = this.players.filter((player) => player.user_id !== holder);
    const index = eligible.findIndex((player) => player.user_id === current);
    return eligible[(index + 1) % eligible.length].user_id;
  }

  event(type, fields = {}) {
    this.game.last_event = { type, at: new Date().toISOString(), ...fields };
    this.game.updated_at = new Date().toISOString();
  }

  async rest(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const userId = requestUser(request);
    const input = request.method() === "POST"
      ? (request.postDataJSON() || {}) : {};
    const participant = this.players.some((player) => player.user_id === userId);

    if (path.endsWith("/games")) {
      const found = this.game && participant &&
        url.searchParams.get("id") === `eq.${this.game.id}`;
      return route.fulfill(json(found ? [this.game] : []));
    }
    if (path.endsWith("/game_players")) {
      return route.fulfill(json(participant ? this.players : []));
    }
    if (path.endsWith("/game_secrets")) {
      const allowed = participant && this.game?.card_holder_user_id === userId;
      return route.fulfill(json(allowed ? [{ country_codes: this.deck }] : []));
    }
    if (!path.includes("/rpc/")) return route.fulfill(json({ message: "Not found" }, 404));
    const name = path.split("/rpc/")[1];
    try { return route.fulfill(json(this.rpc(name, input, userId))); }
    catch (failure) { return route.fulfill(json({ message: failure.message }, 400)); }
  }

  rpc(name, input, userId) {
    if (name === "game_availability") return this.game && this.game.status !== "finished"
      ? { available: false, retry_after_seconds: 2700 }
      : { available: true, retry_after_seconds: 0 };

    if (name === "create_game") {
      if (this.game && this.game.status !== "finished")
        return { available: false, retry_after_seconds: 2700 };
      this.deck = input.shuffled_country_codes;
      const id = `mock-game-${Date.now()}`;
      this.game = { id, singleton_slot: 1, room_code: "MOCK42",
        host_user_id: userId, status: "lobby", win_target: input.target_score,
        card_holder_user_id: userId, turn_user_id: null, current_card_index: 0,
        clue_roll: null, die_roll: null, token_used_this_turn: false,
        bonus_type: null, bonus_user_id: null, last_event: {}, winner_user_ids: [],
        expires_at: new Date(Date.now() + 45 * 60000).toISOString() };
      this.players = [];
      this.addPlayer(userId, input.player_name, input.player_age);
      return { available: true, game_id: id, player_id: this.players[0].id };
    }

    if (name === "join_game") {
      if (!this.game || this.game.status !== "lobby" || input.join_code !== this.game.room_code)
        throw Error("Room not found or already started");
      if (this.players.length >= 6) throw Error("Room is full (6 players)");
      const player = this.addPlayer(userId, input.player_name, input.player_age);
      return { game_id: this.game.id, player_id: player.id };
    }

    if (!this.game || input.target_game_id !== this.game.id)
      throw Error("Game not found");
    if (name === "start_game") {
      if (this.game.host_user_id !== userId || this.players.length < 3)
        throw Error("Host needs three players");
      const oldest = [...this.players].sort((a, b) => b.age - a.age)[0];
      this.game.status = "active";
      this.game.card_holder_user_id = oldest.user_id;
      this.game.turn_user_id = this.players.find((player) => player.user_id !== oldest.user_id).user_id;
      this.event("game_started");
      return null;
    }
    if (name === "roll_die") {
      if (this.game.turn_user_id !== userId || this.game.clue_roll)
        throw Error("Already rolled or not your turn");
      const roll = this.nextRoll++ % 6 + 1;
      this.game.clue_roll = roll;
      this.game.die_roll = roll;
      this.event("die_rolled", { player_name: this.player(userId).name, roll });
      return roll;
    }
    if (name === "get_turn_card_code") {
      return (this.game.clue_roll || this.game.bonus_user_id === userId)
        && this.game.turn_user_id === userId
        ? this.deck[this.game.current_card_index] : null;
    }
    if (name === "pass_turn") {
      if (this.game.card_holder_user_id !== userId || !this.game.clue_roll)
        throw Error("Only holder can pass after a roll");
      this.game.turn_user_id = this.nextGuesser(this.game.turn_user_id, userId);
      this.resetTurn();
      this.event("turn_passed");
      return null;
    }
    if (name === "use_bonus_token") {
      const player = this.player(userId);
      if (this.game.turn_user_id !== userId || this.game.token_used_this_turn || !player.bonus_tokens)
        throw Error("Bonus token unavailable");
      if (input.help_type === "reroll" && !this.game.clue_roll)
        throw Error("Roll first");
      player.bonus_tokens--;
      this.game.token_used_this_turn = true;
      this.game.bonus_type = input.help_type;
      this.game.bonus_user_id = userId;
      if (input.help_type === "reroll") {
        this.game.clue_roll = this.nextRoll++ % 6 + 1;
      }
      this.event("bonus_used", { player_name: player.name, help_type: input.help_type });
      return this.game.clue_roll;
    }
    if (name === "award_point") {
      if (this.game.card_holder_user_id !== userId || !this.game.clue_roll)
        throw Error("Holder must wait for a roll");
      const winner = this.player(input.guessed_user_id);
      winner.score++;
      winner.bonus_tokens++;
      this.game.current_card_index++;
      const holderIndex = this.players.findIndex((player) => player.user_id === userId);
      this.game.card_holder_user_id = this.players[(holderIndex + 1) % this.players.length].user_id;
      this.game.turn_user_id = this.nextGuesser(winner.user_id, this.game.card_holder_user_id);
      this.resetTurn();
      if (winner.score >= this.game.win_target && this.game.win_target !== null) {
        this.game.status = "finished";
        this.game.winner_user_ids = [winner.user_id];
      }
      this.event("point_awarded", { player_name: winner.name, score: winner.score });
      return null;
    }
    if (name === "finish_game") {
      if (this.game.host_user_id !== userId) throw Error("Only host can close");
      if (input.abandon) {
        this.game = null;
        this.players = [];
      } else {
        const high = Math.max(...this.players.map((player) => player.score));
        this.game.status = "finished";
        this.game.winner_user_ids = this.players.filter((player) => player.score === high)
          .map((player) => player.user_id);
        this.event("game_ended");
      }
      return null;
    }
    throw Error(`Unknown RPC ${name}`);
  }

  addPlayer(id, name, age) {
    const player = { id: `mock-player-${this.players.length + 1}`, game_id: this.game.id,
      user_id: id, name, age, score: 0, bonus_tokens: 0,
      joined_at: new Date(Date.now() + this.players.length * 1000).toISOString() };
    this.players.push(player);
    return player;
  }

  player(id) {
    const player = this.players.find((entry) => entry.user_id === id);
    if (!player) throw Error("Player not found");
    return player;
  }

  resetTurn() {
    this.game.clue_roll = null;
    this.game.die_roll = null;
    this.game.token_used_this_turn = false;
    this.game.bonus_type = null;
    this.game.bonus_user_id = null;
  }
}
