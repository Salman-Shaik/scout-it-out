class Player {
  constructor(name, score = 0) {
    this.name = name;
    this.score = score;
  }

  getName() {
    return this.name;
  }

  getScore() {
    return this.score;
  }

  guessedCorrectly() {
    this.score = this.score + 1;
  }

  isWinner() {
    return this.score >= 7;
  }

  static fromJson(playerObj) {
    return new Player(playerObj.name, playerObj.score);
  }

  toJson() {
    return {
      name: this.name,
      score: this.score,
    };
  }
}

export default Player;
