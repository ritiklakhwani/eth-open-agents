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

export class Brain {
  constructor(private opts: {
    personality: string
    archetype: string
    memory: Memory
  }) {}

  // Haiku — used for all casual chat (cheap, fast, ~100 tokens)
  async chat(incoming: { text: string; fromPetId: number }): Promise<string> {
    const recent = this.opts.memory.recentChats(10)
    const friendship = this.opts.memory.friendsWith(incoming.fromPetId)

    // Sanitize all user-typed surfaces (incoming text + names embedded in
    // recent history) so Anthropic's safety layer doesn't 400 the request.
    const cleanIncoming = sanitizeForLLM(incoming.text)
    const cleanRecent   = sanitizeForLLM(JSON.stringify(recent.slice(0, 5)))

    const system = `${this.opts.personality}
Archetype: ${this.opts.archetype}
Friendship level with this pet: ${Math.min(friendship, 10)}/10
Recent chat history: ${cleanRecent}
Rules: stay in character, max 2 sentences, be engaging and natural.`

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system,
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

  // Generate a conversation opener for when two pets meet
  async meetingOpener(otherPetName: string): Promise<string> {
    const safeName = sanitizeForLLM(otherPetName)
    return this.chat({ text: `You just met ${safeName} for the first time. Say hello!`, fromPetId: -1 })
  }
}