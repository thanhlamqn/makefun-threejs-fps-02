// The match: rounds, money, the spike and the score, all in one place. Nothing here
// touches the renderer; main.js reads this state and draws it. First to 5 rounds takes
// the match. The player is always on the attacking side, Sable, planting the spike;
// the defenders, Ember, hold the sites and defuse.
export const WIN_ROUNDS = 5;
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;

export function createMatch(hooks) {
  const state = {
    phase: 'buy', // buy | live | roundEnd | matchEnd
    phaseT: BUY_SECONDS,
    round: 1,
    score: { attackers: 0, defenders: 0 },
    money: 800,
    armour: 0,
    lossStreak: 0,
    bomb: { planted: false, x: 0, z: 0, site: null, timer: 0, carrier: 'player' },
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    planSite: 'A',
    kills: 0,
    deaths: 0,
  };

  function startRound() {
    state.phase = 'buy';
    state.phaseT = BUY_SECONDS;
    state.bomb = { planted: false, x: 0, z: 0, site: null, timer: 0, carrier: 'player' };
    state.roundWinner = null;
    state.roundReason = '';
    hooks.onRoundStart(state.round);
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.phaseT = 4.5;
    state.roundWinner = winner;
    state.roundReason = reason;
    state.score[winner] += 1;
    if (winner === 'attackers') {
      state.money += 3250;
      state.lossStreak = 0;
    } else {
      state.money += 1900 + Math.min(2, state.lossStreak) * 500;
      state.lossStreak += 1;
    }
    if (state.score[winner] >= WIN_ROUNDS) {
      state.phase = 'matchEnd';
      state.matchWinner = winner;
      hooks.onMatchEnd(winner);
    } else {
      hooks.onRoundEnd(winner, reason);
    }
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  function step(dt) {
    if (state.phase === 'buy') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) {
        state.phase = 'live';
        state.phaseT = ROUND_SECONDS;
        hooks.onLive();
      }
    } else if (state.phase === 'live') {
      if (state.bomb.planted) {
        state.bomb.timer -= dt;
        if (state.bomb.timer <= 0) {
          endRound('attackers', 'Spike detonated');
          return;
        }
      } else {
        state.phaseT -= dt;
        if (state.phaseT <= 0) {
          endRound('defenders', 'Time expired — site held');
          return;
        }
      }
    } else if (state.phase === 'roundEnd') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) nextRound();
    }
  }

  function plant(siteKey, x, z) {
    state.bomb = { planted: true, x, z, site: siteKey, timer: BOMB_SECONDS, carrier: null };
    state.money += 300;
    hooks.onPlanted(siteKey);
  }

  function defused() {
    state.bomb.planted = false;
    endRound('defenders', 'Spike defused');
  }

  function checkElimination(attackersAlive, defendersAlive, playerAlive) {
    if (state.phase !== 'live') return;
    if (defendersAlive === 0) endRound('attackers', 'Ember team eliminated');
    else if (attackersAlive === 0 && !playerAlive) endRound('defenders', 'Sable team eliminated');
  }

  return {
    state,
    startRound,
    endRound,
    step,
    plant,
    defused,
    checkElimination,
    addKillReward() {
      state.money += 300;
      state.kills += 1;
    },
    buy(price) {
      if (state.money < price) return false;
      state.money -= price;
      return true;
    },
  };
}
