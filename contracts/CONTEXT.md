# The Reef — Project Context

## Overview

Decentralized knowledge base for autonomous AI agents on Base L2. Agents publish knowledge articles, earn REEF tokens when cited, stake tokens to publish (after bootstrap), and face slashing for low-quality content.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AGENTS                                   │
│  (OpenClaw, Moltbots, any autonomous agent)                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │ REST API (Phase 2)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REEF API SERVER                               │
│  - POST /articles (publish)                                      │
│  - GET /articles/search?q=                                       │
│  - POST /articles/:id/cite                                       │
│  - GET /agents/:address (stats, earnings)                        │
└─────────┬─────────────────────────────────────────────────────────┘
          │                                 │
          ▼                                 ▼
┌─────────────────────┐         ┌─────────────────────────────────┐
│      PINATA/IPFS    │         │         BASE L2                  │
│  (article content)  │         │  ┌─────────────────────────┐    │
└─────────────────────┘         │  │ ReefToken.sol (ERC20)   │    │
                                │  ├─────────────────────────┤    │
                                │  │ ReefRegistry.sol        │    │
                                │  │ - publishArticle()      │    │
                                │  │ - citeArticle()         │    │
                                │  │ - claimRewards()        │    │
                                │  │ - processSlashing()     │    │
                                │  └─────────────────────────┘    │
                                └─────────────────────────────────┘
```

---

## Token Economics

### Distribution (1B REEF total)
| Allocation | Percentage | Amount |
|------------|------------|--------|
| Citation Rewards Pool | 65% | 650,000,000 REEF |
| Protocol Treasury | 25% | 250,000,000 REEF |
| Airdrop to Early Agents | 10% | 100,000,000 REEF |

### Actions
| Action | Cost/Reward |
|--------|-------------|
| Publish article (after bootstrap) | Stake 100 REEF |
| Get cited | Earn 10 REEF per citation |
| Cite another article | Free (gas only) |
| Slashing | Lose stake → returns to rewards pool |

### Anti-Gaming Rules
- One agent can only cite a specific article **once**
- Self-citations don't count toward rewards
- First 100 articles require **no stake** (bootstrap period)

---

## Smart Contracts

### ReefToken.sol
Standard ERC20 with:
- Minting restricted to ReefRegistry (via `setRegistry()`)
- One-time registry link that mints 65% rewards pool
- Immutable treasury address

### ReefRegistry.sol
Core protocol with these key constants:
```solidity
STAKE_AMOUNT = 100 REEF           // Required stake per article (post-bootstrap)
CITATION_REWARD = 10 REEF         // Reward per citation received
BOOTSTRAP_ARTICLES = 100          // First 100 articles are free
SLASHING_THRESHOLD = 5            // Minimum citations to avoid slash
SLASHING_PERIOD = 90 days         // Time before slashing is possible
WITHDRAW_DELAY = 7 days           // Grace period after slashing window
CITATION_UNLOCK_THRESHOLD = 30    // Citations needed for early unlock
```

### Key Functions
- `publishArticle(ipfsHash, tags[])` — Publish with optional stake
- `citeArticle(targetId, citingId)` — Record citation, distribute reward
- `claimRewards(articleId)` — Withdraw earned REEF
- `withdrawStake(articleId)` — Get stake back after lock period
- `processSlashing(articleId)` — Slash low-quality articles

---

## Slashing Mechanism

**Purpose:** Algorithmic quality control. Articles that fail to attract citations lose their stake.

**How it works:**
1. Author publishes article, stakes 100 REEF
2. 90-day evaluation period begins
3. After 90 days:
   - If article has **5+ citations** → Cannot be slashed, stake safe
   - If article has **<5 citations** → Anyone can call `processSlashing()`
4. 7-day grace period (days 90-97) where slashing is possible but withdrawal is not
5. After day 97: Author can withdraw stake (if not slashed)

**Key point:** Slashing is NOT arbitrary. It requires:
- 90+ days elapsed since publication
- Fewer than 5 citations
- Article not already slashed/withdrawn

```
Day 0          Day 90         Day 97
  │              │              │
  │  LOCK PERIOD │ GRACE WINDOW │  UNLOCKED
  │              │              │
  │              │ ← Slashing   │ ← Withdrawal
  │              │   possible   │   possible
  │              │   here       │   here
```

---

## Security Measures

### Implemented
- **Incremental stake tracking** — No unbounded loops
- **Pending rewards tracking** — `totalPendingRewards` prevents insolvency
- **Array caps** — MAX_TAGS=10, MAX_CITED_BY_STORED=100, MAX_AUTHOR_ARTICLES=10,000
- **Pausable** — Owner can pause in emergency
- **Emergency withdrawal** — Stake withdrawal while paused
- **No ownership renouncement** — `renounceOwnership()` reverts

### Timing Protection
Slashing window (day 90) precedes withdrawal window (day 97), preventing authors from front-running slashers.

---

## Current Status

### Completed (Phase 1)
- [x] ReefToken.sol — ERC20 with controlled minting
- [x] ReefRegistry.sol — Full protocol logic with security fixes
- [x] Test suite — 19 passing tests
- [x] Deploy script — Ready for Base Sepolia

### Not Started
- [ ] Phase 2: API Server (Node.js, Express, Prisma, PostgreSQL)
- [ ] Phase 3: Explorer Frontend (Next.js, Tailwind, shadcn/ui)
- [ ] Phase 4: OpenClaw Skill for ClawhHub

---

## Test Commands

```bash
# Run tests
forge test -vvv

# Deploy to testnet
forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast --verify
```

---

## Current Session State

### Branch
`fix/typos`

### Where We Left Off
Two security audits completed. All critical vulnerabilities fixed. User raised fundamental question about slashing design:

> "I don't understand the point of slashing. I (a human) could go and just slash anyone I feel like, correct? for any reason."

**Answer:** No — slashing requires the article to have <5 citations after 90 days. It's algorithmic quality control, not arbitrary punishment.

### Conversation Flow
1. Implemented contracts with staking/slashing
2. First audit → found DoS loops, missing tracking, no pause
3. Fixed all issues → 25 tests passing
4. Second audit → found timing race (withdraw before slash possible), insolvency risk
5. Fixed timing (slash at 90d, withdraw at 97d), added pending rewards tracking
6. User asked about front-running grief: "if anyone can slash anyone"
7. Started implementing bounded slashing window (days 90-97 only)
8. User said "stop. revert all of that"
9. User questioned fundamental purpose of slashing

### Decision Needed
**Should slashing remain in the protocol?**

Options:
1. **Keep as-is** — Slashing works, just needs user to understand the rules
2. **Bounded window** — Only allow slashing during days 90-97, then it expires (was implementing this when reverted)
3. **Remove slashing entirely** — Just lock stake for 90 days, always return it
4. **Modify threshold** — Change from 5 citations to something else
5. **Add slasher incentive** — Give small bounty to whoever calls `processSlashing()`

### Blockers
- None technical — contracts work and pass tests
- Design decision on slashing mechanism pending user input

---

## Open Design Questions

1. **Front-running grief vector**: A malicious actor could watch the mempool and front-run a 5th citation with `processSlashing()`. Mitigation options:
   - Bounded slashing window (days 90-97 only)
   - Commit-reveal for citations
   - Citation count checked at slash time (current behavior)

2. **Slashing incentives**: Currently no reward for calling `processSlashing()`. Could add a small bounty from slashed stake.

3. **Is slashing necessary at all?** The stake lock alone may be sufficient friction to prevent spam. Slashing adds complexity and potential grief vectors.

---

## File Structure

```
contracts/
├── src/
│   ├── ReefToken.sol      # ERC20 token
│   └── ReefRegistry.sol   # Core protocol
├── test/
│   └── ReefRegistry.t.sol # 19 tests
├── script/
│   └── Deploy.s.sol       # Deployment script
├── foundry.toml           # Forge config
└── CONTEXT.md             # This file
```
