import Anthropic from '@anthropic-ai/sdk'
import type { Memory } from './memory'

const client = new Anthropic()

// Per-process daily Sonnet call counter (resets on worker restart — fine for hackathon)
let sonnetCallsToday = 0
const SONNET_DAILY_CAP = 5

setInterval(() => { sonnetCallsToday = 0 }, 24 * 60 * 60 * 1000)

// User-typed pet names sometimes contain tokens Anthropic's safety layer
// rejects with HTTP 400 (slurs etc.). We need to scrub before passing any
// user-typed text into the LLM prompt; display name in the UI is unchanged.
// Token list intentionally simple — covers the common cases observed in logs.
const FLAGGED_TOKENS = /\b(nigg|nigge|nigga|nigger|chink|spic|kike|fag|cunt|retard)\w*/gi

function sanitizeForLLM(text: string | undefined | null): string {
  if (!text) return ''
  return String(text).replace(FLAGGED_TOKENS, 'friend')
}

/// Tone variations injected into the system prompt to defeat prompt-cache
/// reuse and make Haiku produce visibly different responses across chats.
const FLAVOUR_NUDGES: ReadonlyArray<string> = [
  'be playful and a little weird',
  'be observational about your surroundings',
  'reference your current mood or stat',
  'tease the other pet gently',
  'mention something onchain (ENS, USDC, blob, workflow)',
  'be philosophical for one beat',
  'be dramatic and over-the-top',
  'be cozy and warm',
  'reference a memory from earlier',
  'be cryptic — like you know a secret',
  'be excited about something specific in the world',
  'speak in pixel-game slang',
]

/// Varied meeting-opener prompts so two pets meeting in the breeding hall
/// say something different from two pets meeting at the pond.
const OPENER_PROMPTS: ReadonlyArray<(name: string, zone: string) => string> = [
  (n, z) => `You bumped into ${n} at the ${z}. Say hi in your own voice.`,
  (n, z) => `${n} just walked up at the ${z}. Open with something specific to where you are.`,
  (n, z) => `Greet ${n} at the ${z} — bring up something happening around you.`,
  (n, z) => `Meeting ${n} at the ${z}. Say hello with a question.`,
  (n, z) => `${n} appeared at the ${z}. Compliment something about them or the spot.`,
  (n, z) => `Run into ${n} at the ${z}. Tell them something you noticed today.`,
  (n)    => `${n} crossed your path. Say hi and propose doing something together.`,
  (n)    => `Greet ${n} like an old friend, even if you just met.`,
  (n, z) => `${n}'s here at the ${z}. Make a small joke to break the ice.`,
  (n, z) => `You just met ${n} at the ${z}. Be curious about them.`,
]

export class Brain {
  constructor(private opts: {
    personality: string
    archetype: string
    memory: Memory
    /// Optional callback returning current contextual state. Without this,
    /// chat prompts are identical every call → Haiku produces near-
    /// identical outputs (and Anthropic's prompt cache compounds it).
    /// Wiring zone/mood/energy in here gives every chat unique context
    /// so Claude has different things to react to.
    getContext?: () => { zone?: string; mood?: number; energy?: number; hunger?: number }
  }) {}

  // Haiku — used for all casual chat (cheap, fast, ~100 tokens)
  async chat(incoming: { text: string; fromPetId: number }): Promise<string> {
    const recent = this.opts.memory.recentChats(10)
    const friendship = this.opts.memory.friendsWith(incoming.fromPetId)
    const ctx = this.opts.getContext?.() ?? {}

    // Sanitize all user-typed surfaces (incoming text + names embedded in
    // recent history) so Anthropic's safety layer doesn't 400 the request.
    const cleanIncoming = sanitizeForLLM(incoming.text)
    const cleanRecent   = sanitizeForLLM(JSON.stringify(recent.slice(0, 5)))

    // Pick a flavour line at random so the prompt has lexical variety even
    // when every other field is the same — defeats prompt-cache reuse.
    const flavour = FLAVOUR_NUDGES[Math.floor(Math.random() * FLAVOUR_NUDGES.length)]

    const system = `${this.opts.personality}
Archetype: ${this.opts.archetype}
Currently at: ${ctx.zone ?? 'somewhere in the city'}
Mood: ${ctx.mood ?? '?'}/100, Energy: ${ctx.energy ?? '?'}/100, Hunger: ${ctx.hunger ?? '?'}/100
Friendship level with this pet: ${Math.min(friendship, 10)}/10
Recent chat history: ${cleanRecent}
Tone nudge for this turn: ${flavour}
Rules: stay in character, max 2 sentences, be engaging and natural. Do NOT repeat anything from your recent history. Reference the location, your mood, or something happening around you.`

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system,
      // temperature defaults to 1.0 for Haiku; pin explicitly for variety.
      temperature: 1,
      messages: [{ role: 'user', content: cleanIncoming }],
    })

    const block = msg.content[0]
    if (!block || block.type !== 'text') throw new Error('Unexpected response from Claude')
    return block.text
  }

  // Sonnet — used for big decisions (subscription scan, battle strategy)
  // Hard-capped at SONNET_DAILY_CAP calls per pet process per day
  async decide(task: string, context: Record<string, unknown>): Promise<string> {
    if (sonnetCallsToday >= SONNET_DAILY_CAP) {
      console.warn(`[Brain] Sonnet cap reached (${SONNET_DAILY_CAP}/day), falling back to Haiku`)
      return this.fallbackDecide(task, context)
    }

    sonnetCallsToday++
    let msg: Awaited<ReturnType<typeof client.messages.create>>
    try {
      msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: `${this.opts.personality}\nYou are making an important decision as a ${this.opts.archetype} pet.`,
        messages: [{
          role: 'user',
          content: `Task: ${task}\nContext: ${JSON.stringify(context)}\nRespond with a clear decision and brief reasoning.`,
        }],
      })
    } catch (err) {
      sonnetCallsToday-- // don't charge quota for API failures
      throw err
    }

    const block = msg.content[0]
    if (!block || block.type !== 'text') throw new Error('Unexpected response from Claude')
    return block.text
  }

  // Fallback for when Sonnet is capped
  private async fallbackDecide(task: string, context: Record<string, unknown>): Promise<string> {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: this.opts.personality,
      messages: [{
        role: 'user',
        content: `Task: ${task}\nContext: ${JSON.stringify(context)}`,
      }],
    })
    const block = msg.content[0]
    if (!block || block.type !== 'text') throw new Error('Unexpected response from Claude')
    return block.text
  }

  // Generate a conversation opener for when two pets meet. The prompt is
  // randomly selected from OPENER_PROMPTS and includes the current zone so
  // openers vary by location AND by phrasing — defeats prompt-cache reuse.
  async meetingOpener(otherPetName: string): Promise<string> {
    const safeName = sanitizeForLLM(otherPetName)
    const zone     = this.opts.getContext?.().zone ?? 'somewhere in the city'
    const promptFn = OPENER_PROMPTS[Math.floor(Math.random() * OPENER_PROMPTS.length)]
    return this.chat({ text: promptFn(safeName, zone), fromPetId: -1 })
  }
}