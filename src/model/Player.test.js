import Player from "./Player";

describe("Player", () => {
  test("tracks identity and score", () => {
    const player = new Player("Ada");

    expect(player.getName()).toBe("Ada");
    expect(player.getScore()).toBe(0);
    expect(player.isWinner()).toBe(false);

    for (let guess = 0; guess < 7; guess += 1) player.guessedCorrectly();

    expect(player.getScore()).toBe(7);
    expect(player.isWinner()).toBe(true);
    expect(player.isWinner(10)).toBe(false);
    expect(player.isWinner(null)).toBe(false);
  });

  test("serializes and restores a player", () => {
    const restored = Player.fromJson({ name: "Grace", score: 4 });

    expect(restored).toBeInstanceOf(Player);
    expect(restored.toJson()).toEqual({ name: "Grace", score: 4 });
  });
});
