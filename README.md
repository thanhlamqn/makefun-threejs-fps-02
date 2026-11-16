# makefun-threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/thanhlamqn/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/thanhlamqn/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Ember Yard is an original round-based tactical FPS in three.js: you are Sable, attacking a dusk freight yard against the Ember team. Plant the spike at site A or B, or eliminate the defenders; first to 5 rounds takes the match. Between rounds you earn money (kills $300, round wins $3250) and spend it in the buy menu (B) on a rifle, a shotgun, a frag grenade, armour or ammo. Four teammates and five enemies are bots that walk the map's waypoint graph, hold sites, react to gunfire they hear, fire in bursts, and plant or defuse the spike. Gunplay is hitscan with headshots, recoil and spread that punish firing on the move, and movement has acceleration, crouching and collision. The game is static files under game/ with no build step and no network requests; all sound is synthesised with WebAudio.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click to play: WASD moves, mouse looks, click fires, R reloads, 1/2/3 switch weapons, G throws a grenade, E plants the spike inside a site, B opens the buy menu, Ctrl crouches, Space jumps.

---

Entered on [make.fun](https://make.fun/?ref=3ky049kf&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards
