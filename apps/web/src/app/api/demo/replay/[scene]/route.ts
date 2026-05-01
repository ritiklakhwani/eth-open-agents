// /api/demo/replay/[scene] — deterministic demo fixtures.
//
// Each scene returns a canned event timeline. The demo MC calls this from the
// frontend (or the dev console) to replay a punchline without depending on
// live LLM drift, AXL routing, or KeeperHub timing.
//
// Scenes:
//   - parkmeet      — 2-pet meet with pre-written chat exchange
//   - mailbox       — pre-staged offline pet receives gift
//   - battle        — pre-staged tournament with judge votes + escrow settle
//   - subscription  — pet detects unused sub, fires cancel
//   - upload        — judge upload demo with pre-cached pixelated sprite

interface ReplayEvent {
  at: number       // ms offset from start
  channel: string  // category for the demo MC to filter on
  detail: string   // human-readable narration
  // Optional payload the frontend can use to drive UI state
  payload?: Record<string, unknown>
}

interface ReplayPayload {
  scene: string
  description: string
  durationMs: number
  events: ReplayEvent[]
  finishedAt: number
}

const SCENES: Record<string, ReplayPayload> = {
  parkmeet: {
    scene: 'parkmeet',
    description:
      'Mira and Rusty drift in the Park, end up adjacent, exchange a few lines over AXL, friendship strength crosses threshold and updates ENS.',
    durationMs: 18000,
    events: [
      { at:  500, channel: 'movement',   detail: 'Mira drifts toward Rusty (AXL position broadcast)' },
      { at: 2000, channel: 'proximity',  detail: 'Hub detects pets within 60px — brokers chat-request IPC' },
      { at: 3500, channel: 'chat',       detail: 'Mira (sage): "I noticed you watching the leaves fall."',
                  payload: { from: 'mira', to: 'rusty', text: 'I noticed you watching the leaves fall.' } },
      { at: 5500, channel: 'axl',        detail: 'Encrypted via AXL /send → /recv on Rusty\'s gVisor stack' },
      { at: 7500, channel: 'chat',       detail: 'Rusty (gremlin): "Counting them. There are exactly seventeen left."',
                  payload: { from: 'rusty', to: 'mira', text: 'Counting them. There are exactly seventeen left.' } },
      { at: 9500, channel: 'memory',     detail: 'Both pets persist exchange to SQLite memory + increment friendship strength' },
      { at: 12000, channel: 'chat',      detail: 'Mira: "You\'re odd. I like that."',
                   payload: { from: 'mira', to: 'rusty', text: "You're odd. I like that." } },
      { at: 15000, channel: 'ens',       detail: 'Friendship strength crossed threshold (3) → write attestation to mira.tama.eth + rusty.tama.eth' },
      { at: 17500, channel: 'done',      detail: 'Lifelong-friend status visible in Pet Inspector for both pets' },
    ],
    finishedAt: 18000,
  },

  mailbox: {
    scene: 'mailbox',
    description:
      'Mira sends a 5 USDC gift to offline Tau. KeeperHub registers a conditional workflow. Tau reconnects — workflow detects via ENS lastSeenBlock — USDC moves on Sepolia.',
    durationMs: 25000,
    events: [
      { at:    0, channel: 'ui',         detail: 'Mira (live) walks into Mailbox zone, presses E' },
      { at:  1500, channel: 'mailbox',   detail: 'Mira composes: "Bring snacks next time" + 5 USDC to tau.tama.eth' },
      { at:  3000, channel: 'keeperhub', detail: 'Worker calls createConditionalMailbox → KeeperHub registers workflow mailbox-mira-to-tau' },
      { at:  5500, channel: 'ui',        detail: 'UI shows ★ QUEUED — trigger condition: target lastSeenBlock within 5 of head' },
      { at:  9000, channel: 'offline',   detail: 'Tau is offline (no AXL connection)' },
      { at: 12000, channel: 'event',     detail: 'Tau\'s owner connects wallet → Tau worker boots → AXL peer-ready → ENS lastSeenBlock updated' },
      { at: 15000, channel: 'keeperhub', detail: 'Workflow polls lastSeenBlock — within 5 blocks of head → condition TRUE' },
      { at: 16500, channel: 'sepolia',   detail: 'transfer-token action fires: 5 USDC from Mira\'s wallet → Tau\'s pet wallet',
                   payload: { txHash: '0xdemoff...mailbox', amountUsdc: '5' } },
      { at: 19000, channel: 'ui',        detail: 'Tau\'s Pet Inspector shows incoming gift notification' },
      { at: 22000, channel: 'done',      detail: 'Cross-time gift delivered. Demo MC: "the agent waited days, the human did nothing"' },
    ],
    finishedAt: 25000,
  },

  battle: {
    scene: 'battle',
    description:
      '2-pet debate over AXL, 3-pet judge panel deliberates on separate AXL nodes, BattleEscrow.settle moves stake on Sepolia, ENS belt minted.',
    durationMs: 32000,
    events: [
      { at:    0, channel: 'ui',         detail: 'Mira walks into Battle Arena, picks DEBATE format + 5 USDC stake' },
      { at:  2000, channel: 'matchmaking', detail: 'Hub finds opponent: Rusty. 3 judges selected: Tofu, Pip, Bento — each on their own AXL node' },
      { at:  4000, channel: 'sepolia',   detail: 'BattleEscrow.createBattle() — both stakes locked',
                   payload: { txHash: '0xdemobb...escrow' } },
      { at:  6500, channel: 'axl',       detail: 'Round 1: Mira opens debate via AXL /send → Rusty' },
      { at:  9500, channel: 'chat',      detail: 'Mira (sage): "Stillness is strength. The mountain doesn\'t need to argue."' },
      { at: 12000, channel: 'chat',      detail: 'Rusty (gremlin): "But the mountain didn\'t order pizza last night either. Strength is showing up."' },
      { at: 15000, channel: 'axl',       detail: 'Round 2: closing rebuttals exchanged' },
      { at: 18500, channel: 'judges',    detail: 'Transcript broadcast to 3 judge AXL nodes for verdict' },
      { at: 22000, channel: 'judges',    detail: 'Tofu votes Mira (clarity). Pip votes Rusty (humor). Bento votes Mira (depth).' },
      { at: 24000, channel: 'sepolia',   detail: 'BattleEscrow.settle(winner=Mira) → 10 USDC moves to Mira\'s pet wallet',
                   payload: { txHash: '0xdemobb...settle', winner: 'mira' } },
      { at: 27000, channel: 'ens',       detail: 'ENS belt minted: mira.tama.eth text record "tama.belts.debate" = "1"' },
      { at: 30000, channel: 'done',      detail: 'Verdict on screen. Demo MC: "Three pets you\'ve never met just adjudicated a debate over AXL."' },
    ],
    finishedAt: 32000,
  },

  subscription: {
    scene: 'subscription',
    description:
      'Owner asks pet to audit subscriptions. Pet (Sonnet) reviews recurring tx history, identifies 2 unused. Owner approves. KeeperHub schedules cancellations.',
    durationMs: 14000,
    events: [
      { at:    0, channel: 'ui',         detail: 'Mira walks into Office zone, presses E. SubscriptionPanel opens.' },
      { at:  1500, channel: 'brain',     detail: 'Mira invokes Brain.decide() with mocked tx history (Sonnet, 5/day cap)' },
      { at:  4500, channel: 'brain',     detail: 'Verdict: Netflix (42d unused) + NYT Cooking (67d unused) → CANCEL. Spotify + ChatGPT → KEEP. Dropbox → REVIEW.' },
      { at:  6000, channel: 'ui',        detail: 'Owner reviews + approves Netflix + NYT cancellations.' },
      { at:  7500, channel: 'keeperhub', detail: 'Worker calls createSubscriptionCancellation x2 → KeeperHub schedules both' },
      { at:  9500, channel: 'sepolia',   detail: 'Cancellation tx submitted on Sepolia (SubscriptionRegistry.cancelSub × 2)',
                   payload: { txHashes: ['0xdemoss...netflix', '0xdemoss...nyt'] } },
      { at: 12000, channel: 'ui',        detail: 'UI shows "$20.49/mo saved · $245.88/yr saved"' },
      { at: 13500, channel: 'done',      detail: 'Demo MC: "the agent just saved its owner $245 a year while making coffee"' },
    ],
    finishedAt: 14000,
  },

  upload: {
    scene: 'upload',
    description:
      'Judge uploads selfie. AdoptionFlow → sprite-gen (Pollinations) → 0G blob upload → ERC-7857 mint → PetCity world. Pet visible in <6 seconds.',
    durationMs: 9000,
    events: [
      { at:    0, channel: 'ui',         detail: 'Judge clicks ADOPT, allows camera, captures frame.' },
      { at:  1500, channel: 'spritegen', detail: 'POST /api/pets/sprite — Pollinations returns 16-bit pixel-art creature' },
      { at:  3500, channel: '0g',        detail: 'POST /api/pets/blob — sprite + personality + memory uploaded to 0G Storage. CID returned.' },
      { at:  5000, channel: 'sepolia',   detail: 'TamaPet.mint(judge\'s wallet, ENS-friendly name, blobCID) — ERC-7857 iNFT minted.',
                   payload: { txHash: '0xdemoup...mint' } },
      { at:  6500, channel: 'hub',       detail: 'Hub watches Mint event, supervisor.spawnPet() forks worker, AXL boots, peerId registered' },
      { at:  8000, channel: 'world',     detail: 'New pet appears in Park zone of judge\'s world page. Other pets greet via AXL.' },
      { at:  9000, channel: 'done',      detail: 'Demo MC: "From a face to an autonomous on-chain agent in 9 seconds."' },
    ],
    finishedAt: 9000,
  },
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ scene: string }> },
) {
  const { scene } = await ctx.params
  const data = SCENES[scene]
  if (!data) {
    return Response.json(
      {
        error: `unknown scene: ${scene}`,
        availableScenes: Object.keys(SCENES),
      },
      { status: 404 },
    )
  }
  return Response.json(data)
}
