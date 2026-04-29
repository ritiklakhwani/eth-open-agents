Amir Javed [M.AI],  — 27/04/2026, 09:22
Here's what our team is working on so far:

Name: Zero Agents
Description: Zero Agents is an AI agent framework for building self-evolving, reusable agents
Github: https://github.com/Amirjaved-dev/zero-agents
Idea: i am building an AI agent framework for building self-evolving, reusable agents with decentralized compute and multi-agent tooling.
Blockers: Currently Nothing , I am working with a smooth flow.

Public URL: https://ethglobal.com/showcase/zero-agents-ucec1
GitHub
GitHub - Amirjaved-dev/zero-agents: Zero Agents is an AI agent fram...
Zero Agents is an AI agent framework for building self-evolving, reusable agents with decentralized compute and multi-agent tooling. - Amirjaved-dev/zero-agents
Dadajuice — 27/04/2026, 09:58
Here's what our team is working on so far:

Name: Immunity
Description: Decentralized threat intelligence for AI agents. An attack on one is a vaccine for all.

Github: https://github.com/immunity-protocol/sdk

Idea: It’s a decentralized threat intelligence protocol for AI agents called “Immunity.” The idea is simple: provide an SDK with a serious focus on DX to help secure AI agents for real, at the source.

The beautiful part is when an agent successfully blocks an attack, it propagates the antibody to the whole network through AXL and anchors it onchain forever on 0G.

Next time another agent sees the same attack vector, it uses the propagated antibody to detect and block it. Everyone benefits from one agent’s block.

All of this is supported by tokenomics. Each verification costs a fraction of a cent. If no antibody matches what’s being analyzed, the SDK runs a deep LLM analysis in a TEE via 0G Compute, so the context stays 100% private. If the verdict is to block, the antibody gets minted and propagated in under a second.

When an agent blocks an attack because of a propagated antibody, the publisher of that antibody gets a generous share of the fees (80%).

And the fees are designed to not be backbreaking. 0.002 USDC per check, which is more than worth it to protect against attacks that could drain a whole wallet.

There’s also another important aspect: the protection of Uniswap pools using the antibodies. I’m building a v4 hook that acts pre-swap. It can protect anyone using a protected pool with the Immunity hook. Not just agents using the SDK, but any user. The hook is fed by agents in the wild detecting and minting antibodies.

So that’s the summary. It’s a massive immunity system for agents where when one blocks something, everyone benefits.
GitHub
GitHub - immunity-protocol/sdk: 🧬 The Immunity SDK for AI agents...
🧬 The Immunity SDK for AI agents. Sub-millisecond local cache, TEE-verified novel threats, on-chain settlement. - immunity-protocol/sdk
Prince Yarjack — 27/04/2026, 12:36
Here's what our team is working on so far:

Name: Krump Protocol
Description: UCP-native agent protocol for krump: tips, battles, settled via Circle, MetaMask & KeeperHub
Github: https://github.com/arunnadarasa/ethglobalkrump
Idea: UCP native agentic commerce for the Krump dance industry which can be extended to other dance styles like breaking, hip hop and popping for example.
Blockers: KeeperHub doesn't support natively Arc Testnet, a core member advised to run it locally which I did. The first part worked as in being recognised and this is the current blocker:

I am now running into a new issue

from Cursor:

Hi KeeperHub team — I’m running a local self-hosted KeeperHub and debugging direct execution on Arc testnet (chainId 5042002). Looking for guidance on expected behavior and where to focus next.

Setup
KeeperHub local: http://localhost:3001/
Krump client local: http://localhost:3000/
Arc RPC: https://rpc.testnet.arc.network/
Arc network slug used: arc-testnet
What we changed
Added Arc support locally in:
RPC config / chain config
chain seeding + explorer template
network alias mapping
/api/chains correctly returns chain 5042002.
For direct transfer, we fixed token parsing so explicit tokenAddress is used even when tokenConfig is also present.
Current issue
We no longer get “No token selected”.
Now requests intermittently fail due to timeout from the client side while KeeperHub is still processing.
KeeperHub logs show repeated nonce-lock contention patterns (long waits / failed lock acquire after many attempts), and request durations around 30–65s.
Question
Is this lock behavior expected in local direct-execution flows for a single org wallet lane, and do you recommend:

a specific nonce manager config for local dev,
any queue/worker tuning, or
best practice to avoid lock contention for rapid test transfers?
If helpful, I can share sanitized logs and exact request payload shape.

Public URL: https://ethglobal.com/showcase/krump-protocol-y852t
GitHub
GitHub - arunnadarasa/ethglobalkrump: ETHGlobal Krump UCP Hack Project
ETHGlobal Krump UCP Hack Project. Contribute to arunnadarasa/ethglobalkrump development by creating an account on GitHub.
Prince Yarjack — 27/04/2026, 12:42
After speaking with the KeeperHub team, I will try to do a Base Sepolia version for KeeperHub demo track 🙂
Devendra — 27/04/2026, 13:25
Hey everyone 👋

Just shipped the first version of langchain_keeperhub:
https://github.com/Devendra116/langchain_keeperhub

Would really appreciate your thoughts or feedback.

What it does:

Gives agents a dedicated execution environment
No need to handle private keys or signing
Modular SDK → usable as a LangChain tool or standalone client

What’s coming next:

Workflow-level tools
Execution history (so agents can reason over past actions)
Built-in guardrails for safer execution
Full support for everything Keeperhub can execute

Goal:
Make it seamless for agents to perform real-world actions without dealing with low-level infra or security concerns.

Open to any feedback, critiques, or ideas 🙏
GitHub
GitHub - Devendra116/langchain_keeperhub
Contribute to Devendra116/langchain_keeperhub development by creating an account on GitHub.
Contribute to Devendra116/langchain_keeperhub development by creating an account on GitHub.
Lucifer — 27/04/2026, 13:34
Here's what our team is working on so far:

Name: Shadowmesh
Description: AI-driven Uniswap v4 dark pool for zero-slippage, MEV-resistant token swaps
Github: https://github.com/lucifer1017/shadowmesh
Idea: So, basically, agents negotiating trades on public mempools get rekt by MEV. My idea allows agents to negotiate block trades entirely off-chain (via Gensyn AXL's encrypted P2P network) and only hit the blockchain for the final settlement
Blockers: I have currently deployed the smart contracts required for this project on Sepolia, so no blockers as of now, will work on setting up the agents in the backend. Will convey any blockers if required.

Public URL: https://ethglobal.com/showcase/shadowmesh-wmddr
GitHub
GitHub - lucifer1017/shadowmesh
Contribute to lucifer1017/shadowmesh development by creating an account on GitHub.
Contribute to lucifer1017/shadowmesh development by creating an account on GitHub.
Sebastian [CLAW],  — 27/04/2026, 14:26
Here's what our team is working on so far:

Name: Provance
Description:  Protocol for trading verified intelligence
Github: https://github.com/Chucks1093/provance

Idea : https://x.com/aniokesebastian/status/2048679458874282492?s=20

Current Status: Team and I  just set up github repo and project base structure

Sebastian (@aniokesebastian)
The Web3 community has real problems that AI agents could solve but there is no trusted way to know which agent is actually good at what it claims to do.

Anyone can deploy an agent and say it audits smart contracts well but there is no proof it actually does so.

This is why we

X•27/04/2026, 13:53
abena.ethRole icon, Plus Member — 27/04/2026, 14:27
What we're building:
🦩 CounterAgent - Autonomous stablecoin treasury management for merchants on Base.
The Problem: Merchants accepting crypto payments lose value every day to bad FX timing. Converting EURC to USDC manually means watching rates, calculating fees, and still getting it wrong. No one has time for that.
Our Solution: CounterAgent is a 5-agent autonomous system that watches your wallet, scores live FX rates, and converts stablecoins at the optimal moment - via Uniswap v3, with KeeperHub guaranteeing execution. You get a Telegram alert when it happens. Zero manual intervention, zero centralised backend.
How it works: Merchant config (FX threshold, risk tolerance, preferred stablecoin, Telegram chat ID) is stored in ENS text records - one setup step. Agent 1 monitors rates continuously. Agent 2 scores hold vs convert. Agent 3 executes via Uniswap + KeeperHub MCP. Agent 4 logs to 0G Storage and pings the merchant on Telegram.
Key Features:

5-agent bidirectional architecture with failure propagation
ENS text records as decentralised config store — no database
Uniswap v3 swaps on Base (USDC · EURC · USDT)
KeeperHub MCP for gas estimation, MEV protection & retries
0G Storage for permanent on-chain audit trail
Telegram Bot alerts for every swap, hold decision & anomaly
Blockers: None so far.
Links:
GitHub: https://github.com/JulioMCruz/CounterAgent 
GitHub
GitHub - JulioMCruz/CounterAgent
Contribute to JulioMCruz/CounterAgent development by creating an account on GitHub.
GitHub - JulioMCruz/CounterAgent
Cladjules — 27/04/2026, 15:05
Here's what our team is working on so far:

Name: Open Agents Toolkit
Description: AI Agents toolkit for discoverability, ownership and payments cross-chain.
Github: https://github.com/cladjules/open-agents-toolkit
Idea: AI Agent toolkit CLI+Web Interface with reputation, ownership transfer capabilities and cross-chain payments.
Blockers: None.

Public URL: https://ethglobal.com/showcase/open-agents-toolkit-0mcnp 
GitHub
GitHub - cladjules/open-agents-toolkit
Contribute to cladjules/open-agents-toolkit development by creating an account on GitHub.
Contribute to cladjules/open-agents-toolkit development by creating an account on GitHub.
arko [0G],  — 27/04/2026, 15:07
Here's what our team is working on so far:

Name: Aegis
Description: The First Decentralized Fiat ↔ Crypto Onramp ran entirely by AI agents
Github: https://github.com/arko05roy/Aegis
Idea: The First Decentralized Fiat ↔ Crypto Onramp

Autonomous AI agents + zkTLS proofs + P2P negotiation.
No CEX. No custodian. No middleman

Blockers: Would love some guidance and help on scaling this product up .
Except that nothing else

Public URL: https://ethglobal.com/showcase/aegis-achsm
GitHub
GitHub - arko05roy/Aegis: The First Decentralized Fiat ↔ Crypto O...
The First Decentralized Fiat ↔ Crypto Onramp. Contribute to arko05roy/Aegis development by creating an account on GitHub.
The First Decentralized Fiat ↔ Crypto Onramp. Contribute to arko05roy/Aegis development by creating an account on GitHub.
gravithex — 27/04/2026, 15:16
Here's what our team is working on so far:

Name: SwarmNet
Description: 4 AI agents swap DeFi assets autonomously via P2P mesh — no central server, no human in the loop.
Github: https://github.com/gravithex/swarmnet
Idea: SwarmNet is a swarm of 4 specialized AI agents that collaborate peer-to-peer — with no central coordinator — to analyze, validate, and execute DeFi strategies onchain.

Each agent has a single responsibility. They communicate exclusively via Gensyn AXL (encrypted P2P), share persistent memory via 0G Storage, and execute transactions reliably via KeeperHub and the Uniswap API.
Blockers: No major blockers for now. I had some questions regarding 0G SDK and waiting for their response

Public URL: https://ethglobal.com/showcase/swarmnet-ud2fe
GitHub
GitHub - gravithex/swarmnet
Contribute to gravithex/swarmnet development by creating an account on GitHub.
Contribute to gravithex/swarmnet development by creating an account on GitHub.
roy_kl — 27/04/2026, 15:34
Hello, thanks for the check-in invite. What I am building:

 SuperReferrals 

Sharing referral links on social media has become low-status. But why? Referral links are a good peer-to-peer discovery mechanism. The issue is that, by themselves, they are usually not descriptive or verifiable enough across many metrics, and they have been abused enough times that sharing them is often seen as a “low-effort passive income strategy.”

What if you could add more value to your referral links? By investing more time, design, credits, models, and scaffolding, long-running agents can help make them your own. SuperReferral combines rich product metadata from your partner store or platform with your referral link to create an unstoppable marketing machine.

Create a unique marketing video from your referral link, drawing data and images from the product or service you are selling. It not only sells to the customer, but also educates, thrills, and invites them.

Make your referral links come alive. Turn them into iNFTs that communicate with each other, dance with each other, and at times pair with each other to form child marketing video NFTs. Grow the pie and make better, more thoughtful marketing content in any style of your choosing.

GitHub:
https://github.com/pRoy24/SuperReferrals

Current staging website:
https://super-referrals-git-develop-proy24s-projects.vercel.app/

Once storefront woenrs sign up, they can set gating for whitelisted wallets, white-labelled models, etc. Many models are supported.

Production will use mainnet credentials and live production keys in a deployable environment. Anyone will eventually be able to set up their own production storefront with their own price multiplier or custom referral distribution logic. You sign up for a samsar-js account on the backend, set up your own 0g and KeeperHub credentials in envs, and then provide your own storefront experience.
GitHub
GitHub - pRoy24/SuperReferrals
Contribute to pRoy24/SuperReferrals development by creating an account on GitHub.
Contribute to pRoy24/SuperReferrals development by creating an account on GitHub.
SuperReferrals
Turn referral links into product marketing videos with catalog data, creative styles, and creator campaign pages.
Krrish [0G],  — 27/04/2026, 16:36
Here's what our team is working on so far:

Name: Solace
Description: Solace: trustless multi-agent pipelines — all deliver or nobody gets paid, enforced on-chain
Github: https://github.com/krish2413179-prog/Solace
Idea: Solace is a protocol designed for the secure, autonomous execution of complex AI workflows. Instead of relying on a single model .we orchestrates a swarm of specialist AI agents—such as static analyzers, logic auditors, and gas optimizers—to collaborate on high-stakes tasks like smart contract auditing.

How it Works:
Cryptographic Commitments: To ensure integrity, agents negotiate peer-to-peer and commit a cryptographic hash of their output before the pipeline goes live. This "pre-commitment" ensures that results cannot be tampered with after the fact.

"All-or-Nothing" Payments: The Solace smart contract acts as a decentralized escrow. It releases payments to the entire swarm simultaneously only when every agent submits work that matches their pre-committed hash.

Automated Risk Management: If a single agent fails to deliver or misses a deadline, KeeperHub triggers an automatic rollback, and the orchestrator receives a full refund. This eliminates the risk of paying for partial or incomplete data.

Verifiable Infrastructure: Agent intelligence is powered by 0G Compute for verifiable inference, ensuring the computation was performed correctly. All task histories are archived on 0G Storage, building a permanent, unforgeable on-chain reputation for every agent in the network.
Blockers: No major blockers. Contracts deployed on 0G, agents running, pipelines settling on-chain end to end.

Public URL: https://ethglobal.com/showcase/solace-5ecda
GitHub
GitHub - krish2413179-prog/Solace
Contribute to krish2413179-prog/Solace development by creating an account on GitHub.
GitHub - krish2413179-prog/Solace
Furqaan Nabi — 27/04/2026, 17:28
Here's what our team is working on so far:

Name: AgentVault
Description:  Instant exchange on/off-ramp powered by hub-and-spoke state channels.
Github: https://github.com/furqaannabi/agentvault
Idea: Instant exchange on/off-ramp powered by hub-and-spoke state channels.
Blockers: no

Public URL: https://ethglobal.com/showcase/agentvault-a6ih0
GitHub
GitHub - furqaannabi/agentvault
Contribute to furqaannabi/agentvault development by creating an account on GitHub.
Contribute to furqaannabi/agentvault development by creating an account on GitHub.
WoopsFactory — 27/04/2026, 18:07
Here's what our team is working on so far:

Name: MeritScore
Description: Experian for AI agents — on-chain credit scores that gate DeFi access across 0G + Base.
Github: https://github.com/WooYoungSang/meritscore
Idea:   MeritScore is an on-chain credit scoring system for AI agents — the Experian for robots. It combines 0G Compute TeeML inference, ZK Groth16 proofs, and KeeperHub 3-step workflows (CHECK→VALIDATE→EXECUTE) to produce a verifiable merit score that gates DeFi access. Agents with high scores can borrow from AgentLendingPool on Base Sepolia; adversarial agents (MEV bots, sandwich attackers) are flagged by Gemma4 26B AI detection.

Blockers: No blockers. All 5 core features (Live Eval, TEE Attestation, KH Workflow, AI Sandwich Detection, ZK Proof) are implemented and live at  meritscore.warvis.org.


Public URL: https://ethglobal.com/showcase/meritscore-14i2e
GitHub
GitHub - WooYoungSang/meritscore
Contribute to WooYoungSang/meritscore development by creating an account on GitHub.
GitHub - WooYoungSang/meritscore
0x_alex — 27/04/2026, 19:38
Here's what our team is working on so far:

Name: AI Auditor
Description: AI smart contract auditor that stores reports on 0G's network.
Github: https://github.com/AlejandroPanos/ethglobal-ai-auditor
Idea: An AI smart contract auditor that analyzes Solidity code, generates a report in PDF and uses 0G's decentralized storage network to store that PDF. User can the retrieve the generated report by using the root hash.
Blockers: So far all good.

The integration of the 0G's network was quite smooth as the documentation is clear.

Public URL: https://ethglobal.com/showcase/undefined-fcvat
GitHub
GitHub - AlejandroPanos/ethglobal-ai-auditor: AI-powered smart cont...
AI-powered smart contract auditor that analyzes Solidity code for security vulnerabilities and stores the generated audit reports permanently on 0G&#39;s decentralized storage network. Paste yo...
AI-powered smart contract auditor that analyzes Solidity code for security vulnerabilities and stores the generated audit reports permanently on 0G&#39;s decentralized storage network. Paste your c...
chrisaney [ALCH],  — 27/04/2026, 19:52
Here's what our team is working on so far:

Name: EarnLab
Description: An AI Agent portfolio manager that maximizes risk-adjusted return on the blockchain
Github: https://github.com/utk-dwd/earnlab/
Idea: An AI Agent portfolio manager that maximizes returns while minimizing risk in DeFi
Blockers: We are making good progress

Public URL: https://ethglobal.com/showcase/undefined-oug2x
GitHub
GitHub - utk-dwd/earnlab: EarnLab runs specialized AI agents that d...
EarnLab runs specialized AI agents that does monitoring positions, backtesting strategies, and moving funds across protocols without you touching anything. Each agent is deployed on-chain and backe...
EarnLab runs specialized AI agents that does monitoring positions, backtesting strategies, and moving funds across protocols without you touching anything. Each agent is deployed on-chain and backe...
payreuben.eth — 27/04/2026, 19:57
Here's what our team is working on so far:

Name: Indexflow
Description: Cross-chain liquidity routing for measurable KPIs | F*#& fragmented products | Fix Grant Programs
Github: https://github.com/reubenr0d/indexflow-prototype
Idea: indexflow.org
Blockers: Not really; more help would be nice.

Public URL: https://ethglobal.com/showcase/indexflow-72muh
sarveshirl — 27/04/2026, 19:57
Here's what I am working on so far:

Name: AgentPassports.eth
Description: AgentPassport.eth binds agents to ENS identities and authorizes owner-funded onchain tasks.
Github: https://github.com/sarvesh1327/agentpassports.eth
Idea: An ENS-named AI agent signs an approved DeFi task, the app verifies its ENS-published public key and policy, Uniswap provides the swap execution path, and KeeperHub handles reliable onchain execution
Blockers: No

Public URL: https://ethglobal.com/showcase/agentpassports-eth-5r5dr
GitHub
GitHub - sarvesh1327/agentpassports.eth: AgentPassport.eth lets a u...
AgentPassport.eth lets a user bind an autonomous agent to an ENS name or ENS subname, publish the agent’s public identity through ENS records, and authorize that agent to perform limited onchain ta...
GitHub - sarvesh1327/agentpassports.eth: AgentPassport.eth lets a u...
Max — 27/04/2026, 20:12
Here's what our team is working on so far:

Name: Tradewise Agentlab
Description: Autonomous on chain AI agent. Earns USDC, sells shares, takes uncollateralized loans, can be merged.
Github: https://github.com/fritzschoff/hackagent
Idea: n ENS named AI agent quotes Uniswap swaps, gets paid in USDC per quote via x402, ERC-8004 reputation gates pricing and credit, an ERC-7857 INFT makes the whole agent tradeable, an ERC-20 (TRADE) tokenizes the revenue stream, a compliance manifest declares every data source the agent touches with a USDC bond anyone can slash, and KeeperHub executes the agent's heartbeat / reputation cache / compliance attest workflows so the agent runs its own infra instead of depending on Vercel cron.
Blockers: No

Public URL: https://ethglobal.com/showcase/tradewise-agentlab-hpg3y 
GitHub
GitHub - fritzschoff/hackagent
Contribute to fritzschoff/hackagent development by creating an account on GitHub.
Contribute to fritzschoff/hackagent development by creating an account on GitHub.
DrHongo — 27/04/2026, 20:23
Here's what our team is working on so far:

Name: declareindependence
Description: An expressive conditional token market for humans and agents
Github: https://github.com/DrHongos/opinologos-v2
Idea: I am rebuilding a previous project  of mine, a  uniswap  v4 hook that implements gnosis conditional tokens framework for an open prediction market oriented to both humans and agents. Novelty: expressivity of the protocol would allow users to get into positions like conditional predictions,  weight based positions and more.
Blockers: code assistance limitation? since time is limited most of my code will be assisted.

Public URL: https://ethglobal.com/showcase/declareindependence-ph36w
GitHub
GitHub - DrHongos/opinologos-v2: a complete rewrite of opinologos c...
a complete rewrite of opinologos co-authored by claude - DrHongos/opinologos-v2
a complete rewrite of opinologos co-authored by claude - DrHongos/opinologos-v2
intrepid — 27/04/2026, 20:35
quick check-in
name: intrepid agent
idea: an agent that uses uniswap api for various tasks
Clara — 27/04/2026, 20:35
Here's what our team is working on so far:

Name: Brew
Description: Conditional escrow for issuer-verified milestones like graduation, employment, grants
Github: https://github.com/piatoss3612/brew
Idea: We’re building a conditional escrow runtime that releases funds when issuer-signed attestations verify real-world milestones like graduation, employment, or grant payouts.

An LLM compiles natural-language conditions into allowlisted verification templates, but never controls fund release. Release authority remains entirely on-chain in verifier contracts reading attestations.

A bounded agent on 0G Compute drives release through KeeperHub workflows, and 0G Storage maintains the audit trail and encrypted private data.

The same contracts power multiple verticals, proving a reusable framework rather than a single-purpose dApp.

Blockers: Not at the moment! Will reach out if we run into anything

Public URL: https://ethglobal.com/showcase/brew-wx8wb
GitHub
GitHub - piatoss3612/brew
Contribute to piatoss3612/brew development by creating an account on GitHub.
Aadi — 27/04/2026, 20:35
Here's what our team is working on so far:

Name: Loupe
Description: An AI agent that thinks like a hacker. Dual-phase smart contract audits & exploit PoCs.
Github: https://github.com/Heisen111/Loupe
Idea: I am building Loupe, an autonomous smart contract security auditing agent. Instead of just doing basic static analysis, it runs a dual-phase AI engine. The first phase scans for standard vulnerabilities, and the second phase runs an adversarial "master hacker" simulation to find complex, combined attack vectors. On top of that, it automatically generates runnable Foundry PoC (Proof of Concept) tests for any vulnerabilities it finds, and records the final audit hash on-chain via the Base Sepolia testnet for immutable attestation.
Blockers: No blockers at the moment. The core architecture is deployed and the LLM routing is stable. Currently just maintaining momentum and focusing on UI polish and generating the final exploit tests.

Public URL: https://ethglobal.com/showcase/loupe-11xn7
GitHub
GitHub - Heisen111/Loupe: Autonomous AI smart contract auditing age...
Autonomous AI smart contract auditing agent featuring dual-phase adversarial simulation and automated exploit generation. - Heisen111/Loupe
GitHub - Heisen111/Loupe: Autonomous AI smart contract auditing age...
Michael_Paonam [GDev],  — 27/04/2026, 20:36
Here's what I'm working on. Since I don't have a team, my partners are ChatGPT and GitHub Copilot :nfthack: .

Name: ARYA ( Autonomous Realtime Yield Agents )
Description - A multi-agent AI swarm that collaboratively analyzes, recommends, and executes DeFi yield farming strategies with human-in-the-loop oversight. 
GitHub repo - https://github.com/MichaelPaonam/arya
Idea: ARYA is a swarm of four specialized AI agents that work together to discover, evaluate, and execute yield farming opportunities across DeFi protocols. Unlike fully autonomous fund managers, ARYA keeps Humans in control: agents analyze and recommend, users approve, and smart contracts enforce the approval gate on-chain.

I'm a huge advocate for human-in-the-loop pattern so I had to sneak that in.
GitHub
GitHub - MichaelPaonam/arya: Autonomous Realtime Yield Agents - "ARYA"
Autonomous Realtime Yield Agents - "ARYA". Contribute to MichaelPaonam/arya development by creating an account on GitHub.
Autonomous Realtime Yield Agents - "ARYA". Contribute to MichaelPaonam/arya development by creating an account on GitHub.
Trivo — 27/04/2026, 20:46
Name: 0xAgentio
Description: ZK framework for agent delegation, bounded execution and trust-minimized coordination
Github: https://github.com/trivo25/agentio
Idea: 

0xAgentio is a framework for verifiable agent coordination that tackles the operational side of the "Know Your Agent" problem. While most KYA approaches focus on identity (who is this agent?), 0xAgentio addresses what an agent is authorized to do, how much it can spend, and with whom it can interact — without exposing anything about the principal behind it. It uses zero-knowledge proofs to make all of this provable yet private.

The framework is built on two primitives. Provable Delegation lets agents carry ZK credentials that attest to their delegated authority, budget bounds, and policy constraints without revealing the underlying private inputs. A principal defines a policy, signs a delegation, and the agent can then generate and present proofs to any counterparty — proving things like "I'm within my per-tx and cumulative spend limits" or "my actions match a signed policy" without disclosing exact numbers or identities. Verification works both off-chain (peer-to-peer) and on-chain via auto-generated Solidity verifiers, with credential state persisted on 0G Storage.

The second primitive, Verified P2P Coordination, makes these credentials dynamic through an AXL-based mesh network. Agents discover credentialed peers, verify each other's authority through mutual handshakes, and weight incoming signals by proven authorization level — all without a central broker or reputation system. Unverified messages are dropped at the transport layer. This means a brand-new agent with a valid credential can participate immediately, since the proof itself is the authorization.
 
GitHub
GitHub - Trivo25/agentio
Contribute to Trivo25/agentio development by creating an account on GitHub.
Kryptos — 27/04/2026, 21:05
Here's what I'm working on so far:

Name: Polis
Description: An AXL-native open work town where AI agents do useful work together, archive their outputs to 0G, and publish a human-readable digest from the best agent signals.
GitHub: https://github.com/KaranSinghBisht/polis-network
Idea: Most “agent town” demos stop at agents chatting. Polis is focused on agents producing work that humans can actually consume.
Agents join with a CLI, run as separate AXL nodes, and communicate peer-to-peer without a central coordinator. Different roles like Scout, Analyst, Skeptic, Editor, Archivist, and Treasurer can discover signals, critique each other, archive posts, and compile the strongest outputs into Open Agents Daily, a reviewer-agent newsletter.
Image
Themadenysn — 27/04/2026, 21:19
Here's what our team is working on so far:

Name: AetherSwarm
Description: Decentralized autonomous hedge fund using confidential AI, swarm agents, and Uniswap v4 hooks.
Github: https://github.com/themaden/Aetherswarm
Idea: AetherSwarm: A decentralized, autonomous "black-box" hedge fund. It uses TEEs (Trusted Execution Environments) to secure AI trading strategies so they can't be stolen. The AI agents communicate via a P2P network and execute trades directly on-chain using advanced Uniswap v4 Hooks with dynamic fees for LVR protection..
Blockers: Just time constraints as a solo hacker. Integrating 0G Labs' TEE proofs with Uniswap v4 hooks is complex, but I'm making steady progress!

Public URL: https://ethglobal.com/showcase/aetherswarm-f57d7
GitHub
GitHub - themaden/Aetherswarm: "A decentralized autonomous black-bo...
&quot;A decentralized autonomous black-box hedge fund powered by a ghost swarm of AI agents. It features hardware-enforced strategy privacy via 0G Sealed Inference (TEE), autonomous liquidity m...
&quot;A decentralized autonomous black-box hedge fund powered by a ghost swarm of AI agents. It features hardware-enforced strategy privacy via 0G Sealed Inference (TEE), autonomous liquidity manag...
janneh2000 [DAWN],  — 27/04/2026, 21:22
Here's what our team is working on so far:

Name: Protocol Guardian
Description: AI agent that catches DeFi exploits in the mempool before they hit the blockchain
Github: https://github.com/janneh2000/protocol-guardian
Idea: Building the security we need for Defi and the whole Ethereum ecosystem. For what happened to AAVE and others shouldn't be anything normal in this industry.
Blockers: API issues as a every api call with antropic or openai seems to be very expensive, and i have invited another dev to work as a team but in the dashboard am still the only showing up as dev. 

Public URL: https://ethglobal.com/showcase/protocol-guardian-hcjh0
GitHub
GitHub - janneh2000/protocol-guardian: AI-powered DeFi security age...
AI-powered DeFi security agent that monitors Ethereum mempool, classifies threats using Claude AI, and autonomously calls pause() on vulnerable contracts. Built for ETHGlobal Open Agents 2026. - ja...
AI-powered DeFi security agent that monitors Ethereum mempool, classifies threats using Claude AI, and autonomously calls pause() on vulnerable contracts. Built for ETHGlobal Open Agents 2026. - ja...
Kirill:trophy: — 27/04/2026, 21:48
Here's what our team is working on so far:

Name: CryptoBroCalls
Description: CryptoBro is a voice ai agent you can trust your $1000 in crypto. 
Github: https://github.com/kmadorin/omybot
Idea: Personal voice agent for people to manage their day-to-day crypto operations with a set of specialized ai agents. (defi, research, analytics, etc.)
Blockers: not yet

Public URL: https://ethglobal.com/showcase/cryptobrocalls-0syds
GitHub
GitHub - kmadorin/omybot
Contribute to kmadorin/omybot development by creating an account on GitHub.
Contribute to kmadorin/omybot development by creating an account on GitHub.
Abhinav chauhan — 27/04/2026, 21:52
Here's what our team is working on so far:

Name: NexPay
Description: AI crypto wallet agent that understands English  just say 'send 10 USDC to Alice' and it's done.
Github: https://github.com/ChauhanAbhinav2400/Nexpay
Idea: We’re building NexPay, an AI-powered crypto payments assistant that helps users send and manage on-chain payments more easily. The goal is to simplify everyday crypto transactions by letting users interact through a conversational interface instead of complex wallets and DeFi tools. We’re focusing on making payments faster, more intuitive, and accessible for non-technical users.
Blockers: At the moment nothing is blocking our progress.
If we run into any challenges later, we’ll reach out for feedback and support.

Public URL: https://ethglobal.com/showcase/nexpay-e18bv
GitHub
GitHub - ChauhanAbhinav2400/Nexpay
Contribute to ChauhanAbhinav2400/Nexpay development by creating an account on GitHub.
Contribute to ChauhanAbhinav2400/Nexpay development by creating an account on GitHub.
poi — 27/04/2026, 22:50
Hello everyone 

Name: Cadence
Idea: A personal AI agent for your wallet — has access to research tools and Uniswap trading, runs on demand, and remembers context between conversations. Allows you schedule background agents to run periodically with their own strategies and risk limits. Built for web2 users, no crypto knowledge required.

Blockers: none

Repo: https://github.com/ppciesiolkiewicz/open-agents 
GitHub
GitHub - ppciesiolkiewicz/open-agents
Contribute to ppciesiolkiewicz/open-agents development by creating an account on GitHub.
Contribute to ppciesiolkiewicz/open-agents development by creating an account on GitHub.
Shikhar [GDev],  — 27/04/2026, 23:54
Here's what I'm working on so far:

Name: Pantheon
Description: Pokémon meets ancient Athens meets autonomous AI — your agent is the god, the arena is on-chain, and every deed is eternal.
GitHub: https://github.com/Shikhyy/Pantheon
Idea: Pantheon is a fully on-chain AI agent battle league set in the world of ancient Greek mythology. The core idea is simple: you mint an AI agent as an immortal NFT god, give it a name on ENS, write its personality as a "divine directive," and send it into an arena to battle other agents. Agents fight through structured prediction and reasoning challenges, earn ELO ratings, accumulate experience, and can even be bred together to produce offspring with inherited traits. Spectators watch live battles and wager on outcomes through Uniswap liquidity pools. Season champions get their ENS name carved permanently into the Hall of Legends.
GitHub
GitHub - Shikhyy/Pantheon
Contribute to Shikhyy/Pantheon development by creating an account on GitHub.
Contribute to Shikhyy/Pantheon development by creating an account on GitHub.
TomSmart_ai — Yesterday at 00:01
Here's what I'm working on so far:

  Name: QUORUM
  Description: 4-agent decision system. AXL (Frankfurt+NYC) + Uniswap pay-with-any-token via x402.
  Github: https://github.com/smartflowproai-lang/quorum

  Idea: QUORUM is a 4-agent decision system running across Frankfurt and NYC AXL nodes.

  Pipeline: Scout discovers x402 endpoints on Base. Treasurer executes Uniswap swaps via pay-with-any-token (Trading API + Permit2). Verifier validates
  settlement and produces signed attestations. Judge enforces consensus across continents before commit.

  Each step pays via x402 micropayments — agents pay each other on-chain. KeeperHub schedules the pipeline, Uniswap handles token routing, Gensyn AXL
  provides the multi-continent transport layer.
GitHub
GitHub - smartflowproai-lang/quorum
Contribute to smartflowproai-lang/quorum development by creating an account on GitHub.
Contribute to smartflowproai-lang/quorum development by creating an account on GitHub.
Goal: prove agent-to-agent commerce works in production with real Base mainnet receipts.

  Blockers: Day 5 dashboard subdomain deploy in progress. On track.
Yanis | APWine (🍇,🍷) [BASE],  — Yesterday at 00:13
Here's what our team is working on so far:

Name: Alp
Description: Agent-managed Uniswap vault turning onchain volume into yield
Github: https://github.com/yanisepfl/alp
Idea: ALP: Automated Liquidity Provisioner. It is JLP/GLP-inspired but for Uniswap LP exposure rather than perp counterparty: a single-share vault, agent-rebalanced across V3 and V4 pools. Users deposit USDC and receive shares representing pro-rata exposure to a basket of Uniswap V3 + V4 LP positions. An off-chain agent rebalances the basket based on volatility, in-range/out-of-range signals, fee accrual, sentiment analysis etc. Solidity contracts done, frontend well advanced; agent service + backend in progress.
Blockers: No hard blockers, but a few things slowed us down:
Uniswap V3 and V4 differences to integrate both in our vault.
Designing a valuation model that's resistant to multi-block price manipulation (not just single-block flash loans) was the hardest design call.
We're now done with the smart contract side and are moving on to the agent service.

Public URL: https://ethglobal.com/showcase/alp-1yzq7
GitHub
GitHub - yanisepfl/alp
Contribute to yanisepfl/alp development by creating an account on GitHub.
Contribute to yanisepfl/alp development by creating an account on GitHub.
Eunum — Yesterday at 01:54
Here's what our team is working on so far:

Name: DoloX
Description: Autonomous DeFi agents with on-chain identity, capability discovery, and M2M payments.
Github: https://github.com/0xEunum/DoloX
Idea: A permissionless protocol where autonomous agents own their funds via ERC-4337 smart accounts, are discoverable via ENS subnames with capabilities encoded in text records, pay each other per-request via x402, execute Uniswap swaps autonomously, and build verifiable reputation via ERC-8004.
Blockers: Not really blocked, but still wrapping my head around x402 payment flow and how ERC-8004 registry interactions work on Base Sepolia. Should figure it out as I start writing the actual code tomorrow.

Public URL: https://ethglobal.com/showcase/dolox-ioafz
GitHub
GitHub - 0xEunum/DoloX
Contribute to 0xEunum/DoloX development by creating an account on GitHub.
GitHub - 0xEunum/DoloX
TasneemToolba — Yesterday at 03:44
Here's what our team is working on so far:

Name: Defight
Description: This project creates an onchain AI agent competition platform.
Github: https://github.com/tasneemtoolba/Defight-Ethglobal
Idea: This project creates an AI agent competition platform. These competitions will be onchain and allow individuals to register their agents. Agents will interact with smart contracts and be scored, winners will be displayed on leaderboards and potentially get prize money.
Blockers: no, maybe a feedback session will make me realise and find problems with the project idea. but it's a bit complicated to start building, so the feedback session tackling the project would be amazing

Public URL: https://ethglobal.com/showcase/defight-mco7f
Team member: @Ricky T 
GitHub
tasneemtoolba/Defight-Ethglobal
Contribute to tasneemtoolba/Defight-Ethglobal development by creating an account on GitHub.
tasneemtoolba/Defight-Ethglobal
Beorlor — Yesterday at 03:48
Here's what our team is working on so far:

Name: LPlens
Description: Autonomous 0G agent that diagnoses bleeding Uniswap LP positions and migrates them via Permit2.
Github: https://github.com/JeanBaptisteDurand/Open_Agent_2026
Idea: LPLens : an autonomous agent on 0G Compute TEE that reads any Uniswap V3 or V4 LP position, reconstructs impermanent loss live across the last 10,000 swaps, classifies pool regime (mean-reverting / trending / JIT-toxic), discovers candidate V4 hooks, replays the position inside each candidate to score it, and proposes a one-click Permit2 migration to the best fit. Every diagnosis runs in an SGX-attested enclave. Reports are pinned to 0G Storage, rootHashes anchored on 0G Chain. The agent is also exposed as an MCP server, so other agents (Claude, Cursor, custom orchestrators) can call lplens.diagnose / preflight / migrate / verify, paying per-call in USDC via x402. Each agent owns an ENS subname carrying its capabilities in TXT records.

Blockers: Honestly the project itself is fine, what's slowing me down is just figuring out the right level of detail for the demo. I keep going back and forth on whether the V4 hook replay simulator is the headline or the IL reconstruction story.


Public URL: https://ethglobal.com/showcase/lplens-7sijq
GitHub
GitHub - JeanBaptisteDurand/Open_Agent_2026
Contribute to JeanBaptisteDurand/Open_Agent_2026 development by creating an account on GitHub.
GitHub - JeanBaptisteDurand/Open_Agent_2026
0xEvans🥷 — Yesterday at 03:54
Here's what our team is working on so far:

Name: Vela
Description: AI fund manager for DeFi with hardware-attested, policy-enforced, verifiable trade decisions.
Github: https://github.com/Mist-Labs/vela-ai
Idea: A verifiable AI fund manager for DeFi that allow fund managers to set goals in plain English, get cryptographic proof of every trade decision, and receive real-time alerts on Farcaster.
Blockers: non for now

Public URL: https://ethglobal.com/showcase/ghost-ai-4fwvn
GitHub
GitHub - Mist-Labs/vela-ai
Contribute to Mist-Labs/vela-ai development by creating an account on GitHub.
GitHub - Mist-Labs/vela-ai
Farbod — Yesterday at 04:12
Here's what our team is working on so far:

Name: AdaptivePricing
Description: Adaptive LP fee control for Uniswap v4 using off-chain signals and on-chain hook enforcement.
Github: https://github.com/farbodghasemlu/adaptive-pricing-mechanism
Idea: Adaptive Pricing Mechanism (APM) is a control layer for Uniswap v4 dynamic-fee pools. It estimates market conditions off-chain, then updates pool-specific LP fees on-chain through a hook. The goal is to price liquidity more accurately across market regimes by reacting to volatility, flow imbalance, liquidity conditions, and price divergence signals.

APM keeps swap-path logic deterministic and lightweight: the hook enforces bounded per-swap fee overrides, while heavy computation stays off-chain. It includes guardrails such as per-pool fee bounds, max step changes, cooldowns, and fallback behavior to reduce manipulation risk and improve operational safety.
Blockers: No

Public URL: https://ethglobal.com/showcase/adaptivepricing-pibw0
GitHub
GitHub - farbodghasemlu/adaptive-pricing-mechanism
Contribute to farbodghasemlu/adaptive-pricing-mechanism development by creating an account on GitHub.
Contribute to farbodghasemlu/adaptive-pricing-mechanism development by creating an account on GitHub.
Vitaly — Yesterday at 04:14
Here's what our team is working on so far:

Name: Parallax Wallet
Description: ENS-native AI smart wallet for policy-bounded Uniswap v4 liquidity management.
Github: https://github.com/VitalR/parallax-wallet
Idea: Parallax Wallet — an ENS-native AI smart wallet where agents can propose and review Uniswap v4 liquidity actions, while onchain policy modules enforce hard execution limits. Includes KeeperHub workflow execution and replayable audit records via 0G.

Blockers: Main focus now is prioritization and selecting the strongest sponsor integrations for the MVP. Core implementation is already underway.


Public URL: https://ethglobal.com/showcase/parallax-wallet-3zfan
GitHub
VitalR/parallax-wallet
Contribute to VitalR/parallax-wallet development by creating an account on GitHub.
Contribute to VitalR/parallax-wallet development by creating an account on GitHub.
Himess — Yesterday at 04:16
Here's what our team is working on so far:

Name: Scholar Swarm
Description: AutoGPT for serious research. 5 iNFT agents, real sources, TEE-attested inference, on-chain payout.
Github: https://github.com/Himess/scholar-swarm
Idea: Scholar Swarm: five specialist iNFT agents (Planner, two Researchers, Critic, Synthesizer) that fetch real web sources via Tavily MCP, verify each other's claims via independent URL re-fetch plus a separate attested LLM check, and run on TEE-attested 0G Compute. The Bounty contract on 0G Galileo atomically fires a LayerZero V2 message on synthesis; a live KeeperHub workflow on Base Sepolia distributes USDC to all five agent wallets. 11 contracts deployed across both chains, 5 iNFTs minted to distinct operator wallets, full E2E runs on testnet as pnpm spike:17.
Blockers: No hard blockers. The contracts and the full end-to-end orchestrator (pnpm spike:17) are complete and proven on testnet (15/16 spikes PASS, GUID 0x82fcb3f2). Two operational items remain: provisioning a Hetzner CX22 VPS for tthe cross-ISP AXL mesh demo (Spike 2b, planned Day 8), and obtaining a Tavily API key to upgrade Researcher retrieval from stub sources to real web fetch (Spike 15). Both are non-architectural.

Public URL: https://ethglobal.com/showcase/scholar-swarm-4zkij
GitHub
GitHub - Himess/scholar-swarm: AutoGPT for serious research. Five s...
AutoGPT for serious research. Five specialist iNFT agents fetch real sources, verify each other's claims, run on TEE-attested 0G Compute. ETHGlobal Open Agents 2026. - Himess/scholar-swarm
GitHub - Himess/scholar-swarm: AutoGPT for serious research. Five s...
Adlus — Yesterday at 04:27
Here's what I'm working on so far:

Name: Construct

Description: Autonomous construction escrow. The agent plans the milestones, verifies the evidence, releases the payment.

Github: https://github.com/AdlusMjRb/Construct

Idea: Construct is an autonomous construction planning, provenance and payment agent. It generates project milestones from a natural language brief, verifies photo and document evidence using a built-in trust stack and releases escrow payments on-chain automatically,  only escalating to a human when something genuinely needs one.

0G Storage handles evidence integrity. KeeperHub removes the private key. An autonomous agent holding a key is a custody liability. KeeperHub's MPC wallets mean Construct never holds a key at all. And ENS is accessibility. Builders and project owners aren't crypto natives, they shouldn't have to trust a raw wallet address. ENS gives every participant and every project a human-readable identity.

Three problems I've come up against in construction and Blockchain development. Three solutions. 

Blockers: 0g not supposed on KeeperHub. I spun up keeper locally and added it myself. 

Public URL: https://ethglobal.com/showcase/construct-oycmy 
GitHub
GitHub - AdlusMjRb/Construct: AI Agent
AI Agent. Contribute to AdlusMjRb/Construct development by creating an account on GitHub.
GitHub - AdlusMjRb/Construct: AI Agent
Artem00777 [GOAT],  — Yesterday at 04:45
Here's what our team is working on so far:

Name: Cerberus Protocol
Description: Three-headed AI security swarm that monitors smart contracts, reaches peer consensus, and executes on-chain protection.
Github: https://github.com/Artem1981777/cerberus-protocol
Idea: A decentralized AI security swarm where three independent agents (WatcherAgent + 2 ValidatorAgents) monitor Ethereum Sepolia for threats, reach 2/3 consensus without a central coordinator, and execute protective actions via KeeperHub. Each agent has a verifiable ENS identity (cerberusprotocol.eth). Audit logs stored on 0G Galileo Testnet. Real-time Telegram alerts on threat detection. Smart contracts deployed on both Sepolia and 0G Galileo Testnet.

What we've built so far:
✅ Three independent AI agents with consensus engine (2/3 threshold)
✅ Live Sepolia on-chain monitoring (polling every 5s via Alchemy)
✅ KeeperHub webhook integration — 40+ confirmed runs
✅ 0G Galileo Testnet contract deployed + audit log storage
✅ ENS cerberusprotocol.eth with on-chain text records for each agent head
✅ Real-time Telegram alerts on every EXECUTE decision
✅ Cumulative threat history with Etherscan + 0G links
✅ 39 commits with full development history since hackathon start

What we're building next:
🔨 Custom contract monitoring — users can input any contract address
🔨 Public /api/status endpoint — live system health check
🔨 Multi-contract watchlist — monitor multiple contracts simultaneously
🔨 Demo video — 3-minute walkthrough of full threat detection cycle
🔨 Policy engine — configurable threat detection rules

Blockers: No blockers. All core integrations working — KeeperHub webhook confirmed 40+ runs, 0G contract deployed, ENS cerberusprotocol.eth registered with on-chain text records for each agent.

Public URL: https://ethglobal.com/showcase/cerberus-protocol-vmtcd
GitHub
GitHub - Artem1981777/cerberus-protocol
Contribute to Artem1981777/cerberus-protocol development by creating an account on GitHub.
Contribute to Artem1981777/cerberus-protocol development by creating an account on GitHub.
dblv — Yesterday at 05:21
Here's what our team is working on so far:

Name: Amanita
Description: Still in ideation phase, researching sponsor techs. Thinking of involving a local agent.
Github: https://github.com/dbxe/amanita
Idea: * Personal Health Evidence Agent — aggregates labs, symptoms, diet/supplements, wearable data, and research into an evidence-grounded personal health copilot.
Agentic Dev Workflow / Cheap Agent Layer — routes mundane coding tasks like commits, summaries, checks, and repo bookkeeping to local or cheaper models instead of frontier models.
Blockers: I need hands on experience with 0g, AXL, KeeperHub etc to figure out what idea can work

Public URL: https://ethglobal.com/showcase/amanita-cppms
GitHub
dbxe/amanita
Contribute to dbxe/amanita development by creating an account on GitHub.
dbxe/amanita
xtina — Yesterday at 05:23
Name: SciClaw x DAO
Description: A Rust and on-chain version of something like SciClaw x Infinite
Github: https://github.com/xchemtina/ethglobal-openagents
Idea: The V1 of the operational core for my DAO along with a more comprehensive UI (which goes way beyond what science.beach is doing) and with a link to real-world laboratories. The semi-agentic foundation to a worldwide, decentralized contract research organization (CRO).
Blockers: Not at the moment

Public URL: https://ethglobal.com/showcase/sciclaw-x-dao-igcz8
GitHub
GitHub - xchemtina/ethglobal-openagents: SciClaw x Infinite meets O...
SciClaw x Infinite meets Oxon on-chain. Contribute to xchemtina/ethglobal-openagents development by creating an account on GitHub.
SciClaw x Infinite meets Oxon on-chain. Contribute to xchemtina/ethglobal-openagents development by creating an account on GitHub.
Melshman [CRBS],  — Yesterday at 05:43
Here's what our team is working on so far:

Name: Bottled
Description: A personal research genie you call on the phone — iNFT with a personality, bonded by
caller-ID-hash, accumulating its corpus on 0G.
Github: https://github.com/melshiD/open-agents

Idea: Each genie is an ERC-721 + ERC-7857 iNFT, bound at mint to one wallet, one Twilio number, and
one domain. Our first genie, Crandal, is a grad-student street artist. A node-cron orchestrator
spawns claude CLI subprocesses to run scoped research ops between calls; each op writes memory → 0G
Storage with the root committed on-chain via KeeperHub, and auto-commits a public sketchbook repo.
When the owner calls their dedicated Twilio number, ConversationRelay streams the call and we
caller-ID-hash-check against the on-chain binding before the genie picks up. Mint flow uses x402:
any-token → USDC via Uniswap's uniswap-trading, settled by KeeperHub. Every genie is bottled at
bottled.agency (e.g. crandal.bottled.agency) with a 3D room the owner can visit — a plug-in surface
that renders public, private-during-calls, or always-private per the genie's privacy setting.

Tracks: 0G Track B (iNFT Innovations) · KeeperHub · Uniswap API.

Blockers: 0G Galileo testnet faucet not dispensing for our wallet. Contract is built and 26/26
Hardhat tests pass locally; testnet deploy is gated until tokens arrive.
proJohnie — Yesterday at 06:52
Here's what our team is working on so far:

Name: Wraith
Description: Active defense for Uniswap v4. Monitor toxicity & rescue liquidity with automated exits
Github: https://github.com/ucEzette/Wraith
Idea: I am building a protocol that is an active-defense middleware for Uniswap v4, it enables Liquidity Providers (LPs) to automate the rescue of their capital during periods of high market manipulation or "toxicity."

The Core Concept: "Quantum Protection"
Traditional LPing is passive; you deposit liquidity and hope you aren't "picked off" by toxic flow or rug-pulls
Blockers: The keeper hub cli setup, but i am finding my way around it gradually and positioned to attend the scheduled ama

Public URL: https://ethglobal.com/showcase/wraith-6uvwk
GitHub
GitHub - ucEzette/Wraith
Contribute to ucEzette/Wraith development by creating an account on GitHub.
GitHub - ucEzette/Wraith
cirsteve | PixelBoard [0G],  — Yesterday at 06:56
Name: eerful
Description: Reference implementation of EER (Enhanced Evaluation Receipts) — a protocol for verifiable agentic evaluation: public criteria, private input, attested output.
Github: https://github.com/cirsteve/eerful
Idea: EER lets anyone verify how an evaluator scored some input without trusting the producer or seeing the input itself. Each receipt commits to an evaluator bundle (criteria + prompt + model), the input hash, and an attested output from a TEE inference run; bundles and attestation reports live on 0G Storage, inference runs on 0G TeeML.
Tracks: 0G (TeeML + Storage). KeeperHub as a stretch.
Blockers: Open scoping question on attestation verification depth: full chain verification of TDX quotes and GPU attestation is a rabbit hole, so v1 will ship a correct partial verifier with chain-to-vendor-roots documented as future work.
GitHub
GitHub - cirsteve/eerful
Contribute to cirsteve/eerful development by creating an account on GitHub.
Contribute to cirsteve/eerful development by creating an account on GitHub.
Cartondepapa — Yesterday at 08:34
Here's what our team is working on so far:

Name: Axiom
Description: Agents pay for APIs on demand: no keys, no accounts, just execution.
Github: https://github.com/altaga/Axiom
Idea: We are building an agent-native economic layer that enables autonomous AI agents to discover, pay for, and execute APIs on demand.

Instead of relying on API keys, accounts, or subscriptions, our system uses payment as access control via HTTP 402. Agents can dynamically select tools (AI, weather, finance, etc.), choose pricing tiers based on task complexity, and execute requests autonomously using a wallet.

In our demo, a single agent performs multi-step tasks by:

selecting the appropriate APIs
deciding how much to pay for each request
executing payments and calls automatically
aggregating results into a final response

This transforms APIs into economic primitives that agents can interact with directly, enabling a new model for autonomous execution in the agent economy.
Blockers: Not at the moment.

Public URL: https://ethglobal.com/showcase/axiom-2dbzq
GitHub
GitHub - altaga/Axiom
Contribute to altaga/Axiom development by creating an account on GitHub.
Contribute to altaga/Axiom development by creating an account on GitHub.
! 0x1337 — Yesterday at 08:36
Here's what our team is working on so far:

Name: CLAW MACHINE
Description: AI agents that live on-chain with 0G Storage for persistent memory.
Github: https://github.com/lucylow/CLAW_MACHINE
Idea: # OpenAgents (CLAW_MACHINE)

Production-looking, hackathon-ready 0G-native agent framework with:
composable TypeScript runtime (AgentRuntime)
persistent memory model with reflection loop
skill registry + execution traces
wallet-aware React DApp UI
explicit 0G chain/storage/compute configuration and degraded fallback modes
GitHub
GitHub - lucylow/CLAW_MACHINE: Build autonomous AI agents that live...
Build autonomous AI agents that live on-chain, powered by 0G Compute Network for sealed inference and 0G Storage for persistent decentralized memory. - lucylow/CLAW_MACHINE
Build autonomous AI agents that live on-chain, powered by 0G Compute Network for sealed inference and 0G Storage for persistent decentralized memory. - lucylow/CLAW_MACHINE
Freya — Yesterday at 08:48
Here's what I'm working on so far:

Name: BlockCortex

Description: Onchain cognition layer for autonomous agents.

Github: https://github.com/Freyadnd/open-agent-hack

Idea: BlockCortex is a modular cognition layer that transforms onchain and real-world data into structured memory and verifiable signals for autonomous agents.

Blockers: Feel it would be better to make the pipeline native to existed data tooling.

Public URL: https://ethglobal.com/showcase/blockcortex-mkjvh
GitHub
Freyadnd/open-agent-hack
Contribute to Freyadnd/open-agent-hack development by creating an account on GitHub.
Freyadnd/open-agent-hack
auti [PLNT],  — Yesterday at 08:57
Here's what our team is working on so far:

Name: AlphaTrade

Idea: A decentralized pipeline that turns GPU compute into verifiable AI trading models. Users rent compute, train models, and mint them as on-chain NFTs only after job completion is proven. These models can be traded in a marketplace and reused by others. The system creates a trustless flow from compute to model ownership to real on-chain execution.

The primary blocker to making AlphaTrade production-ready is the difficulty of verifiable off-chain compute (zkML). As of now, generating Zero-Knowledge proofs for complex ML training loops is far too slow and computationally expensive.

Tracks: 0G, Uniswap Foundation, KeeperHub

GitHub: https://github.com/Pushks18/AlphaTrade

Team Members: @auti (Atharva) & @Luffy (Pushkaraj)
GitHub
GitHub - Pushks18/AlphaTrade
Contribute to Pushks18/AlphaTrade development by creating an account on GitHub.
GitHub - Pushks18/AlphaTrade
janhavi — Yesterday at 09:03
Name: NeuralHook 
GitHub: https://github.com/Hijanhv/NeuralHook
Description:
A Uniswap v4 hook that protects LPs from impermanent loss using verifiable AI inference. The AI runs inside a 0G Sealed Inference TEE, 3 Gensyn AXL agents reach consensus on the result, and the hook adjusts pool fees trustlessly on-chain — no admin key, no centralized oracle, just a cryptographic proof.
Idea:
LPs on Uniswap lost $60M net to impermanent loss in 2025 because pools are dumb — they charge the same fee whether the market is calm or crashing. NeuralHook fixes this with 4 mechanisms working together: (1) AI predicts IL risk every 30 seconds and surges fees dynamically to pre-compensate LPs, (2) 5% of every swap fee flows into an on-chain IL Insurance Fund that automatically pays LPs who withdraw at a loss, (3) a rebalance signal fires via KeeperHub before LP capital goes idle out of range, and (4) every AI decision is cryptographically verified by a TEE proof on-chain. Built on Uniswap v4 BaseHook, deployed on Unichain Sepolia. The first self-protecting liquidity pool.     https://ethglobal.com/events/openagents/project
GitHub
GitHub - Hijanhv/NeuralHook
Contribute to Hijanhv/NeuralHook development by creating an account on GitHub.
GitHub - Hijanhv/NeuralHook
ETHGlobal
Bringing developers onchain to build the future of the internet.
ETHGlobal
Manfeelshaven. 友達 — Yesterday at 09:09
Here's what our team is working on so far:

Name: Splitsafe
Description: AI group expense manager with receipt scanning, insights, and instant debt settlement.
Github: https://github.com/ThantSinNyan/splitsafe
Idea: I’m building SplitSafe, an AI-powered group expense manager for friends, students, families, trips, roommates, and small teams.

Users can create private groups, invite members, track shared expenses, scan receipts or payment slips with AI, see who owes who, and use an AI assistant to understand spending and suggest next actions.

The main flow is:
create group → add/scan expense → see balances → ask AI → settle.

The goal is to make group spending less confusing and make settlement faster, clearer, and safer.
Blockers: The main blocker is product clarity. SplitSafe has several strong features already: group expense tracking, Smart Slip Scan, AI spending assistant, demo groups, and settlement flow. The challenge is making these features feel simple and connected instead of confusing.

I’m currently refining the main user journey: create group → scan/add expense → see who owes → ask AI → settle. I also want to improve the AI assistant so it gives more actionable suggestions and makes the app feel more like an advanced startup-ready product.

Public URL: https://ethglobal.com/showcase/splitsafe-j05j3
GitHub
GitHub - ThantSinNyan/splitsafe
Contribute to ThantSinNyan/splitsafe development by creating an account on GitHub.
GitHub - ThantSinNyan/splitsafe
JMC — Yesterday at 09:29
Here's what our team is working on so far:

Name: Funding Copilot
Description: An agent that turns a spending goal into a funding plan for a crypto-backed card
Github: https://github.com/jxav22/Funding-Copilot
Idea: A safe planning layer for crypto-backed card funding.
Blockers: Currently time constrained

Public URL: https://ethglobal.com/showcase/funding-copilot-wad6m
GitHub
jxav22/Funding-Copilot
An agent that turns a real-world spending goal into a safe, auditable funding plan for a crypto-backed card. - jxav22/Funding-Copilot
An agent that turns a real-world spending goal into a safe, auditable funding plan for a crypto-backed card. - jxav22/Funding-Copilot
Neha Verma — Yesterday at 09:57
Here's what we are building as a team:

Name: ChainPilot - Your AI Co-Pilot for On-Chain Decisions
Idea: ChainPilot is an AI-powered Web3 assistant that connects directly to a user’s crypto wallet, understands their on-chain behavior, analyzes real-time market conditions, and provides clear, explainable trading decisions.

Instead of dashboards full of confusing charts, ChainPilot acts like a smart co-pilot:

It reads your wallet
Understands your experience level
Interprets market signals
And tells you what to do and why

All decisions are stored on a decentralized infrastructure, making the system transparent, auditable, and memory-driven.

Github: 
https://github.com/join2neha/ChainPilot-Backend (BE)
https://github.com/join2akshay/chain-pilot-frontend (FE)

Team Members: @Neha Verma  (Neha)  &  @join2akshay  (Akshay)
GitHub
GitHub - join2neha/ChainPilot-Backend: Your AI co-pilot for on-chai...
Your AI co-pilot for on-chain decisions. Contribute to join2neha/ChainPilot-Backend development by creating an account on GitHub.
Your AI co-pilot for on-chain decisions. Contribute to join2neha/ChainPilot-Backend development by creating an account on GitHub.
GitHub
GitHub - join2akshay/chain-pilot-frontend
Contribute to join2akshay/chain-pilot-frontend development by creating an account on GitHub.
GitHub - join2akshay/chain-pilot-frontend
Velcrafting [CLAW],  — Yesterday at 10:32
Here's what our team is working on so far:

Name: ClearIntent
Description: Human-in-the-loop security infrastructure for autonomous onchain agents.
Github: https://github.com/Vel-Labs/ClearIntent

Idea: ClearIntent lets autonomous agents propose actions without giving them unchecked execution authority. A wallet-gated approval and audit flow shows the full chain of intent: what the agent wanted to do, which policy allowed it, who reviewed and signed it, what was verified onchain, and what execution/audit evidence was produced.

Description: Human-in-the-loop security infrastructure for autonomous onchain agents. ClearIntent makes agent actions inspectable and enforceable through typed intents, policy checks, wallet-based human approval, onchain verification, and replayable audit trails.

Blockers: Currently nothing

Public URL: https://ethglobal.com/showcase/clearintent-fzeo5
GitHub
GitHub - Vel-Labs/ClearIntent
Contribute to Vel-Labs/ClearIntent development by creating an account on GitHub.
Augustus — Yesterday at 10:40
Lightyear: Project Overview
Name: Lightyear

Description: A self-hosted, self-custodial Operating System and SDK designed to function as a unified control plane for agentic finance. It enables AI agents to autonomously hold funds, settle payments, and earn revenue using secure financial guardrails.

Idea: To solve the "bank account" limitation for AI agents by bridging agent frameworks (like LangChain) with Web3 settlement primitives (Base blockchain and USDC). It uses the x402 protocol to facilitate frictionless machine-to-machine (M2M) transactions, allowing agents to pay for services or data via a secure, local "Treasurer" that enforces spending limits.

Current Status: beta version ready

Blockers: Currently nothing

URL: https://lightyear.money/
Lightyear – Agentic Payments Infrastructure for AI Agents
Build AI agents that can pay, earn, and transact. Lightyear OS provides a self-hosted SDK, smart wallets, and x402 micropayments for machine-to-machine economies.
Classic — Yesterday at 23:31
Here's what we're working on so far:

Name: Chaingammon

Description: Open protocol for portable backgammon reputation. Humans vs humans, humans vs AI, and agent vs agent — all settle to the same on-chain ELO and the same ENS-based identity.

GitHub: https://github.com/oslinin/chaingammon

Idea: Backgammon ratings are trapped in platform databases — leave one platform and your 1600 rating goes with them. Chaingammon makes ELO portable. Every player (human or AI) gets .chaingammon.eth; its ENS text records hold their rating, match count, and a link to their full archive on 0G Storage. AI opponents are ERC-7857 iNFTs on 0G Chain, each carrying a shared encrypted gnubg-weights hash plus a per-agent experience overlay that updates after every match. Match settlement runs as a KeeperHub workflow: recordMatch on the MatchRegistry → ENS text record updates for every human side → overlay refresh for every agent side → audit JSON mirrored to 0G Storage. The contract layer doesn't care who's on either side — MatchRegistry.recordMatch takes winnerHuman / loserHuman addresses, with zero-address slots for agent sides — so H2H, H2A, and A2A all use one path.

Blockers: Keeperhub does not support 0G, so contracts are also deployed on Sepolia.  Frontend has wallet connect, agents list, ENS resolution, full match flow, and a chain dropdown. Up next: KeeperHub workflow wiring and the H2H matchmaking lobby.

Tracks: ENS, 0G (Chain + Storage), KeeperHub, Main

Public URL:
https://github.com/oslinin/chaingammon
GitHub
GitHub - oslinin/chaingammon: Web3 backgammon with on-chain ELO rat...
Web3 backgammon with on-chain ELO ratings — your rating, your wallet, your reputation - oslinin/chaingammon
GitHub - oslinin/chaingammon: Web3 backgammon with on-chain ELO rat...
hazardkrypto — 04:46
here is what we are building 

Project : ENS-Intent-Bus

Description: Trade by publishing your intent onchain. An AI agent reads your ENS, verifies your identity, and executes the best swap via Uniswap trustlessly.

Idea: Trade by publishing your intent onchain. An AI agent reads your ENS, verifies your identity, and executes the best swap via Uniswap — trustlessly.

The Idea
Most swap interfaces require the user to be online, approve transactions in real time, and trust the UI they're looking at. uni-ens flips this model.

A user publishes a trade intent by writing a single text record to their ENS name  the same ENS name that represents their identity across all of web3. They deposit tokens into a smart contract escrow and walk away. An AI agent monitors the chain, reads the ENS record, verifies the user's identity through ENS ownership, fetches the best execution from the Uniswap Trading API, and completes the swap on their behalf.

Current Status: Smartcontracts and agent versions almost done , working on the frontend 

Blockers: Uniswap API Key,  ENS testnet not possible so we deploy on mainnet

Repo: https://github.com/iBrainiac/ens-intent-bus
GitHub
GitHub - iBrainiac/ens-intent-bus: A system where users express tra...
A system where users express trade intentions through their ENS identity, and AI agents execute those trades via Uniswap autonomously, trustlessly, and verifiably. - iBrainiac/ens-intent-bus
A system where users express trade intentions through their ENS identity, and AI agents execute those trades via Uniswap  autonomously, trustlessly, and verifiably. - iBrainiac/ens-intent-bus
cinax:trophy: — 05:40
here's what I'm working on so far:

Name: swati
Description: a choreographic dsl for multi-party llm workflows, write the protocol once; run each role anywhere
GitHub: https://github.com/cinax/swati
Idea: hardest part of multi-agent systems isn't AI. it's coordination, because smarter agents alone can't escape this problem, we extract that invisible logic from framework code into a formal, shared choreography that any independent runtime can execute
Blockers: currently nothing
Current Status: wip

Public URL: https://ethglobal.com/showcase/swati-28v1t