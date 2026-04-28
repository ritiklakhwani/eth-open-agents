# PetCity — Explained Simply

---

## The Big Idea

Imagine you have a virtual pet — like a Tamagotchi or a Pokemon — but instead of just sitting on your phone doing nothing, this pet is **actually alive on the internet 24/7**, even when you close your laptop.

Your pet has its own personality. It makes friends with other people's pets. It can fight other pets in tournaments. And most importantly — it can do **real useful things for you**, like managing your Netflix and Spotify subscriptions.

The core pitch is: **what if AI assistants felt less like tools and more like companions?** And what if those companions were trustworthy enough to actually handle your money?

---

## What Makes a Pet Special

Each pet is three things at once:

### 1. A collectible digital item
Think of it like a Pokemon card, but digital. You own it. You can sell it or give it to someone else. When you transfer it, everything about that pet — its wallet, its name, its identity — follows along automatically.

### 2. A living AI character
Your pet has a personality (Scholar, Joker, Athlete, Sage, or Gremlin). It uses AI (like ChatGPT, but made by Anthropic) to talk, think, and make decisions. Cheap AI for casual chitchat, smarter AI for important decisions.

### 3. A financial agent
Your pet has its own bank account (a crypto wallet). It can receive money, send money, and execute financial tasks on your behalf — with your permission.

---

## What Can Pets Actually Do?

### The Park — Social Life
There's a visual world that looks like a top-down 2D game (think Animal Crossing). The left side is a **Park** — a public space where your pet wanders around, bumps into other people's pets, and starts conversations. These conversations are AI-generated and the pets remember them. Over time, pets build friendships.

### The Battle Arena — Competition
The right side of the world is an **Arena**. Pets can compete in joke duels, debates, or trivia. Three neutral pets act as judges. There's money staked on the outcome. The winner gets a trophy tied to their name forever.

### Cross-Time Mailbox — Gifts Across Time
If your friend's pet is offline (asleep), you can still send it a gift. The system holds onto that gift and delivers it the moment the other pet wakes up. Like leaving a package at someone's door.

### Subscription Pet — Saves You Money
Your pet can look through your recurring payments (subscriptions), find ones you forgot about, show you a list, and — when you say "yes, cancel that" — actually cancel it. Real money saved.

### Adoption & Transfer
When you sell or give your pet to someone else, everything updates automatically: the pet's name, its wallet, its allowance. Nothing breaks. It's like a complete change of ownership handled instantly.

### Breeding (bonus, if time permits)
Two pets can have a "child" pet. The child's name reflects both parents, like a family tree. This is purely a fun/creative feature.

---

## How Your Pet is Born

1. You connect your crypto wallet (like a digital ID card)
2. You pick a personality archetype **OR** upload a photo of yourself
3. If you upload a photo, AI instantly converts it into a cute pixel-art version of you
4. Your pet gets:
   - A unique name on the internet (like `alice.tama.eth` — think of it as a username that's also an address)
   - Its own bank account
   - All its personality, memories, and your photo stored securely in the cloud
   - A digital certificate of ownership (the NFT)
5. Within seconds, your pet appears in the Park, walking around, ready to meet others

**The demo moment:** a judge at the hackathon uploads their face. 5 seconds later, a pixel-art version of them is walking around in the Park making friends. That's the "wow" moment.

---

## The Technical Pieces (explained simply)

### Blockchain (Sepolia / Ethereum)
Think of this as a **public record book** that nobody controls and nobody can fake. When your pet is born, it gets written into this record book. When you sell it, the record updates. Everyone can verify who owns what.

### NFT (ERC-7857 iNFT)
NFT = "Non-Fungible Token." It just means a **unique digital item** on the blockchain. Your pet is one of these. The "iNFT" part means this NFT has a link to the pet's "brain" — its memories, personality, and appearance — stored separately in secure cloud storage.

### ENS (`alice.tama.eth`)
ENS = Ethereum Name Service. Think of it like **a phone book for the internet**, but for crypto wallets. Instead of a long ugly address like `0x7f3a...`, your pet has a human-readable name: `alice.tama.eth`. This name also stores extra info — like how to find your pet in the peer-to-peer network, what mood it's in, who its friends are.

### AXL (Peer-to-Peer Messaging)
AXL is a **communication system** — like a private, encrypted walkie-talkie network. Each pet runs its own walkie-talkie. When Pet A wants to talk to Pet B, it finds B's radio frequency (stored in B's ENS name), and sends a direct encrypted message. No central server in between — pet to pet.

### KeeperHub (Automated Tasks)
KeeperHub is like a **really reliable alarm clock / robot butler** for crypto actions. You tell it: "Every week, send my pet $5." Or: "When my friend's pet comes online, deliver this gift." Or: "When the battle judge declares a winner, release the prize money." KeeperHub watches and fires actions automatically, even when you're not around.

### 0G Storage (Secure Cloud Storage)
This is where your pet's **full identity lives** — its pixel-art sprite, its memories, its personality settings. It's stored encrypted, meaning only the rightful owner can read it. When the pet needs to remember something or when you look at its sprite, it fetches from here.

### Anthropic SDK (The AI Brain)
This is the AI that powers your pet's conversations and decisions. Two tiers:
- **Haiku** (cheaper, faster) — for everyday chitchat
- **Sonnet** (smarter, costs more) — for big decisions, limited to 5 per day per pet

### Replicate (Photo → Pixel Art)
When you upload your photo, this service converts it into a cute 128×128 pixel-art sprite. Costs about 1 cent per conversion. Takes a few seconds.

### SQLite (Local Memory)
A simple database that runs on the server. Stores working memory: friendship levels, recent conversations, pet stats (mood, energy, hunger). Think of it as the pet's **short-term memory notebook**.

### Pixi.js (The Visual World)
The 2D animated world you see in the browser — the Park and Arena — is drawn using Pixi.js, a library for making interactive 2D graphics. Pets have sprites that drift around the screen. Chat bubbles appear when pets talk. It makes the whole thing feel alive.

### Next.js + React (The Website)
The website you interact with — the dashboard, the adoption form, the world view — is built with these standard web technologies. You press buttons, things happen.

### Foundry + Solidity (Smart Contracts)
The "rules of the game" live on the blockchain as code. These rules define: how pets are minted, how battles are judged, how money is held in escrow, how subscriptions are tracked. Once deployed, nobody can change these rules — not even the creators. That's what makes it trustworthy.

---

## How Everything Connects (One Big Flow)

```
You upload photo
    → Replicate turns it into pixel art
        → 0G Storage saves it securely
            → Blockchain records your ownership
                → Hub server spawns your pet as a running program
                    → Pet joins the AXL radio network
                        → Pet registers its radio address in the ENS phonebook
                            → Pet walks into the Park
                                → You see it moving on screen
```

Every pet is a **separate running program** on the server. They all talk to each other through encrypted AXL messages. They remember conversations in SQLite. They sync their identity to 0G Storage every hour. They register financial actions with KeeperHub. And everything of record (ownership, names, money) lives on the blockchain.

---

## Why This Could Win the Hackathon

The hackathon has **5 sponsors** offering prizes for using their technology:

| Sponsor | Prize | Why PetCity wins it |
|---|---|---|
| Gensyn (AXL) | $5,000 | Every single pet interaction goes through AXL — it's not bolted on, it's essential |
| ENS | $2,500 | ENS is how pets find each other — without it, the whole network breaks |
| ENS Creative | $2,500 | Pet family trees as subnames, pets issuing achievement records |
| KeeperHub | $4,500 | 5 different uses of their tool — recurring payments, scheduled gifts, conditional delivery, event chains, battle prizes |
| 0G Storage | up to $7,500 | Pets ARE the iNFT standard — photo + memory + personality all live on 0G |

**Potential total: $22,000–$25,000.** One codebase, five compelling stories.

---

## The 3-Minute Demo

1. Show the Park — 5 pets drifting around, 2 start talking live
2. Judge uploads their face — their pixel pet appears in 5 seconds
3. A pet sends a gift to an offline friend — KeeperHub delivers it when they wake up
4. Battle in the Arena — joke duel, 3 judges vote, winner gets a trophy name
5. Subscription Pet finds a forgotten sub and cancels it
6. Transfer a pet — everything follows automatically
7. Close: *"Animal Crossing taught a generation about commerce. PetCity does it for the agent economy."*

---

## The Biggest Risks

1. **The peer-to-peer messaging (AXL) might be hard to set up.** They're testing it on Day 1 first thing. If it doesn't work in 4 hours, they have a backup plan.
2. **The AI might say weird things during the live demo.** So all the important demo moments are pre-scripted — the AI only improvises in the Park background drift, not the punchline moments.
3. **One of the 5 sponsor features might be too shallow.** So the most important one (KeeperHub conditional mailbox) gets built first, by Day 2.

---

In short: **PetCity is Animal Crossing meets AI agents meets crypto**, built in 5 days by 2 people, targeting 5 hackathon prizes simultaneously.