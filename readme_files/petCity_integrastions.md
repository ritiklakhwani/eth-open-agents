Why judges remember PetCity
Hackathon judges at ETHGlobal see 200+ submissions in 2 days. Their pattern:

80% blur together: chatbot wrappers, generic frameworks, "AI does X for crypto" — they nod, take notes, forget.
15% are technically impressive but boring: deep infra, no demo punch — they respect, don't remember.
5% they tell their colleagues about over dinner: visual, novel, emotionally sticky.
PetCity targets the 5%. Three reasons it lands there:

The "judge uploads their face" moment — visceral, personal, takes 5 seconds, ends with their pixelated avatar living in a multiplayer world. Most demos are shown to judges. This one is experienced by them.
Consumer-fun lane is empty — scan your winners list: not one consumer/social project across 12 hackathons. Everyone builds DeFi/infra. PetCity stands alone in its category by default.
Cross-track narrative — "ENS fills the discovery gap that Gensyn AXL admits to in their own docs." That's a sentence judges will repeat to other judges. It frames the project as infrastructure even though it's wrapped in fun.
Track-by-track integration depth
Gensyn AXL — $5,000 single ranked pool
What they want (from their brief): depth of AXL integration, real utility over novelty, communication across separate AXL nodes (qualification gate).

How PetCity hits it:

Each pet runs its OWN axl-node binary in its OWN process with its OWN ports
Pet-to-pet chat, judge-panel deliberation, gift mailbox, Park rendezvous — every interaction goes over AXL
5 pets = 5 separate AXL nodes visibly running during demo
Pet 0 acts as Park gossip rendezvous (fills the no-discovery gap)
Optionally uses MCP/A2A protocol patterns (their two built-in framings)
Integration depth: 10/10. AXL is architecturally non-removable — without it, no pet socializing works. Not bolted on.

Realistic placement: 1st-3rd → $1,000-$2,500. This is literally the "Agent Town" example they suggest in their brief.

ENS — $5,000 across TWO prizes
Prize A: Best ENS Integration for AI Agents ($2,500)
What they want: ENS doing real work — resolution, metadata, gating, discovery. Functional demo, no hardcoded values.

How PetCity hits it:

<pet>.tama.eth per pet, addr() resolves to pet's smart wallet
Text record tama.peerId holds the AXL public key — ENS becomes the discovery layer Gensyn AXL admits to lacking ("There is no built-in service registry... Keys must be exchanged directly between people" — their own docs)
Anyone can send USDC to mira.tama.eth and the pet receives it
Pets find each other by ENS lookup, not out-of-band key swap
Integration depth: 9/10. Real lookup, real work, plus a cross-partner story that's rare to pull off.

Realistic placement: 1st-2nd → $750-$1,250.

Prize B: Most Creative Use of ENS ($2,500)
What they want: verifiable credentials in text records, auto-rotating addresses, subnames as access tokens (their exact wording).

How PetCity hits it:

Pet-issued attestations — pets vouch for other pets, written as ENS text records (verifiable credentials)
Achievement records — battle belts, friendship milestones, tournament wins as text records
Lineage subname tree (if breeding ships) — pup.fluffy.tama.eth under both parents
Integration depth: 8/10 (9-10 if breeding ships).

Realistic placement: 2nd-3rd → $500-$1,250.

Combined ENS take: $1,250-$2,500.

KeeperHub — $4,500 single ranked pool + $500 feedback bounty
What they want: "Would someone actually use it?", depth of integration, real utility. Two focus areas: innovative use OR framework integration.

How PetCity hits it — 5 distinct primitives:

#	Primitive	Where used
1	Recurring (Schedule trigger)	Weekly USDC allowance owner→pet
2	One-shot scheduled	Future birthday gifts
3	Conditional (HERO)	Cross-time mailbox: poll ENS lastSeenBlock, fire when recipient wakes
4	Event-listener	BattleEscrow.Verdict → release stakes + ENS attestation
5	Chained workflow	Adoption Transfer → ENS update + USDC sweep + wallet rebind
Plus Subscription Pet — pet brain uses KeeperHub MCP to analyze owner's recurring tx, propose cancellations, schedule them. Real consumer utility ("pet saved me $20/mo").

Integration depth: 10/10. Both focus areas covered (innovative + framework integration). Five primitives = obvious depth-of-use signal. Subscription Pet is a genuinely useful product feature, not a hackathon novelty.

Realistic placement: 1st-2nd → $1,500-$2,500. Plus likely the $250 feedback bounty.

0G — Track 2: Autonomous Agents/Swarms/iNFT — $7,500 pool, top 5 get $1,500 each
What they want: "iNFT-minted agents with embedded intelligence (encrypted on 0G Storage), persistent memory, dynamic upgrades, automatic royalty splits" (their literal words).

How PetCity hits it:

Pets ARE ERC-7857 iNFTs (literal match)
Pet's full identity blob (custom sprite + memory + personality + traits) lives encrypted on 0G Storage
TamaPet contract's intelligenceCID updates as pet evolves — dynamic upgrades
Adoption transfer = NFT moves + 0G blob CID re-pointed atomically
The "judge uploads face → pet on 0G in 5s" demo is the visceral proof
Integration depth: 8/10. iNFT is architecturally earned (custom sprite gives sealed storage real purpose). Could be 9-10 if we add 0G Compute for sealed inference on pet decisions.

Realistic placement: top-5 placement → $1,500.

Skipped: Uniswap ($5,000)
Honest call: forcing Uniswap into PetCity would be cosmetic ("pets trade for owner") and dilute the core. Better to win 4 tracks deeply than 5 shallowly. $5,000 deliberately left on table.

Aggregate prize math
Track	Conservative	Realistic	Optimistic
Gensyn AXL	$1,000	$1,500	$2,500
ENS Identity	$750	$1,000	$1,250
ENS Most Creative	$500	$750	$1,250
KeeperHub main	$500	$1,500	$2,500
KeeperHub feedback	$0	$250	$250
0G iNFT	$0	$1,500	$7,500
Total	$2,750	$6,500	$15,250
What makes the integration genuinely hard to beat
Most submissions will go deep on one track with shallow bolt-ons elsewhere. PetCity goes deep on four tracks simultaneously because the architecture demands it:

AXL is required for pet society — can't fake it
ENS is the discovery + credential layer — can't fake it
KeeperHub is the autonomy engine — can't fake it
0G is where pet identity actually lives — can't fake it
A judge cross-checking integrations sees architectural necessity, not prize-chasing. That's the rare quality that separates winning multi-track submissions from disqualified ones.

The real moat is the cross-track narrative:

"ENS fills the discovery gap that Gensyn admits to" — judges of both tracks like this
"0G makes the iNFT angle real because the custom sprite needs encrypted storage" — judges of 0G see it as earned
"KeeperHub's mailbox uses ENS lastSeenBlock as the trigger" — judges of KeeperHub see ENS leveraged