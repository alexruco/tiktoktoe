---
repo: alexruco/tiktoktoe
title: "Batch TikTokToe Game"
type: planning
tags: [planning, specification, scoping]
issue: 1
status: in-progress
---

# Specification: Batch TikTokToe Game

**Date:** 2026-04-17
**Author:** info@dimensao-aclamada.pt
**Status:** Draft

---

## Overview

> A batch execution mode for tiktoktoe that runs multiple tic-tac-toe games automatically — supporting AI vs AI, AI vs random, or any configured pair of strategies — collecting win/loss/draw statistics across a configurable number of games.

---

## Background & Motivation

The tiktoktoe project currently supports single interactive games. To evaluate and compare strategies (e.g. minimax vs random, minimax vs minimax), developers need to run hundreds of games and observe aggregate outcomes. Without a batch mode, this requires manual repetition and ad-hoc scripting. A first-class batch runner makes strategy benchmarking reproducible and easy to invoke from the CLI or as part of a CI workflow.

## Goals

- Run N games between two configurable players (human-selectable strategy per side)
- Collect and report aggregate results: wins per player, draws, and win rate
- Support at least two built-in strategies: random move and minimax
- Expose a simple CLI interface: `tiktoktoe batch --player1 minimax --player2 random --games 100`
- Output results as a human-readable summary and optionally as JSON

## Non-Goals

- Real-time visualization or animation of individual games in batch mode
- Multiplayer networking or remote player support
- Persistent leaderboard or database storage of results
- Training or learning agents (reinforcement learning is out of scope)

## Detailed Design

### Data Model

```
GameResult {
  winner: "X" | "O" | "draw"
  moves: number          // total moves played
  board: string[9]       // final board state
}

BatchConfig {
  player1: StrategyName  // "minimax" | "random"
  player2: StrategyName
  games: number          // default: 100
  outputFormat: "text" | "json"  // default: "text"
}

BatchSummary {
  totalGames: number
  player1Wins: number
  player2Wins: number
  draws: number
  player1WinRate: number  // 0–1
  player2WinRate: number
  drawRate: number
  results: GameResult[]   // only included in JSON output
}
```

### API / Interface

```
// CLI
tiktoktoe batch [options]
  --player1 <strategy>   Strategy for player X (default: minimax)
  --player2 <strategy>   Strategy for player O (default: random)
  --games <n>            Number of games to run (default: 100)
  --output <format>      Output format: "text" or "json" (default: text)

// Programmatic
import { runBatch } from './batch'

const summary: BatchSummary = await runBatch({
  player1: 'minimax',
  player2: 'random',
  games: 100,
  outputFormat: 'text',
})

// Strategy interface
interface Strategy {
  name: string
  chooseMove(board: Board, player: 'X' | 'O'): number  // returns cell index 0–8
}
```

### Behavior

1. CLI parses `--player1`, `--player2`, `--games`, `--output` flags, applying defaults.
2. Both strategy instances are constructed for the configured names; unknown names throw a clear error.
3. A game loop runs `games` times:
   a. Board is reset to empty state.
   b. Players alternate moves (X always goes first).
   c. After each move, the board is checked for a win or draw.
   d. The result (`winner`, `moves`, final `board`) is recorded.
4. After all games, a `BatchSummary` is computed from the results array.
5. In `text` mode, a formatted table is printed: total games, wins per player, draws, win rates.
6. In `json` mode, the full `BatchSummary` (including per-game results) is printed to stdout.
7. Process exits with code 0 on success.

## Error Handling

| Error Case | Behavior | User-Facing Message |
|------------|----------|---------------------|
| Unknown strategy name | Throw before any games run | `Unknown strategy "<name>". Available: minimax, random` |
| `--games` is 0 or negative | Throw before any games run | `--games must be a positive integer` |
| Strategy returns invalid move (out-of-range or occupied cell) | Throw with context | `Strategy "<name>" returned invalid move <n> on turn <t>` |
| Strategy throws internally | Propagate with wrapper error | `Strategy "<name>" threw an error: <original message>` |

## Security Considerations

- No user-supplied code execution; strategies are selected by name from a fixed registry.
- No network calls; batch mode is fully local.
- No file I/O beyond optional stdout JSON; no path traversal risk.
- Input validation on `--games` (must be a positive integer) prevents unbounded loops.

## Testing Plan

- [ ] [BOT]: Unit test: `runBatch` with minimax vs random over 1000 games — minimax (X) should win ≥ 99% (#2)
- [ ] [BOT]: Unit test: `runBatch` with minimax vs minimax — all results should be draws (#3)
- [ ] [BOT]: Unit test: unknown strategy name throws the expected error message (#4)
- [ ] [BOT]: Unit test: `--games 0` throws before running any game (#5)
- [ ] [BOT]: Unit test: `BatchSummary` totals equal the configured game count (#6)
- [ ] [BOT]: Integration test: CLI `tiktoktoe batch --player1 random --player2 random --games 10 --output json` exits 0 and outputs valid JSON (#7)
- [ ] [HUMAN]: Manual review: verify text output table is readable and win rates sum to 1 (#8)

## Open Questions

- [ ] TBD — Should the batch runner support a `--seed` flag for reproducible random strategies?
- [ ] TBD — Should per-game results be streamed to stdout as NDJSON rather than buffered until the end?

## Alternatives Considered

| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Shell script wrapping single-game CLI | No code changes needed | Slow (process spawn per game), no aggregate stats | Rejected — too slow for 1000+ games |
| In-process worker threads per game | True parallelism, faster wall time | Complexity, shared-state bugs | Deferred — not needed for MVP batch size |
| CSV output format | Easy to import into spreadsheets | Less expressive than JSON for nested data | Rejected in favour of JSON; text table covers human-readable use case |

---

*Provided by [mdblu](https://github.com/ruco-ai/mdblu)*

---
*Made with [mdblu](https://github.com/ruco-ai/mdblu) · source: `templates/SPEC.md.template`*
