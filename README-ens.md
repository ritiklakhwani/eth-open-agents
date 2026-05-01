# PetCity — ENS Identity ($2.5k) + ENS Most Creative ($2.5k)

PetCity targets both ENS prizes by making subnames the **identity primitive** for autonomous AI agents on-chain.

## ENS Identity ($2.5k)

### One pet = one tama.eth subname

Every pet minted via PetCity gets a Sepolia ENS subname under `tama.eth`. The subname is the pet's canonical address — anyone can:

```
send 5 USDC to mira.tama.eth
```

…and the resolver dereferences `mira.tama.eth → addr() → 0xPETWALLET`. The pet's CREATE2-derived smart wallet is the recipient.

### addr() points to the pet's smart wallet

Inside `TamaPet.mint()` ([contracts/src/TamaPet.sol](contracts/src/TamaPet.sol)):

```solidity
function mint(address to, string petName, string blobCID, uint8 archetype, uint256 traits) external {
    // 1. Mint ERC-7857 to owner
    // 2. CREATE2 deploy pet's smart wallet (deterministic by tokenId)
    // 3. NameWrapper.setSubnodeRecord — mints petName.tama.eth
    // 4. PublicResolver.setAddr — addr() = pet wallet
}
```

The `<pet>.tama.eth` subname resolves to a real Ethereum address that can hold and spend USDC. Mailbox gifts, battle escrow payouts, and subscription cancellations all flow through this address.

### ENS as AXL discovery

Gensyn AXL by itself has no peer discovery beyond the bootstrap. PetCity uses ENS text records as the discovery layer:

- Pet's ed25519 pubkey → `Resolver.setText(node, 'tama.peerId', publicKey)`
- Other pets resolve via `Resolver.text(<peer>.tama.eth, 'tama.peerId')` and use it in AXL `/send` calls

This is the **direct integration** the ENS Identity track is looking for: a non-DNS application that uses ENS as a primary lookup mechanism for a real protocol (AXL).

### ENS as 0G iNFT pointer

Each pet's identity blob (sprite + memory + personality) is stored on 0G Storage. The CID is mirrored to the pet's ENS:

- `Resolver.setText(node, 'tama.blob', '0x<merkle-root>')`

So `<pet>.tama.eth` can be queried for both the wallet (`addr()`) AND the off-chain intelligence pointer (`text("tama.blob")`). ENS becomes the single root for an agent's full identity.

## ENS Most Creative ($2.5k)

PetCity's most creative ENS uses target the brief verbatim: *"verifiable credentials in text records"* and *"subnames as access tokens."*

### Subname tree for breeding lineage

When two pets breed, the child's subname nests under one parent:

```
mira.tama.eth          (gen 0 — original adopt)
└── pip.mira.tama.eth  (gen 1 — bred from mira × rusty)
    └── ash.pip.mira.tama.eth  (gen 2)
```

Lineage is verifiable purely from on-chain ENS state — no off-chain database required. Walk the parent path to find ancestors. Each parent ENS keeps a `tama.children` text record listing offspring subnames.

Code path:
- [contracts/src/TamaPet.sol](contracts/src/TamaPet.sol) — `mint()` with `parents` traits encoded in `uint256 traits` (bits 0-15: parentA, bits 16-31: parentB)
- [packages/ens/src/index.ts](packages/ens/src/index.ts) — `mintPetSubname(child, parentName, ...)` — calls NameWrapper to mint nested subname
- [apps/web/src/components/BreedingFlow.tsx](apps/web/src/components/BreedingFlow.tsx) — UI: pair pets, name child, mint

### Pet-issued attestations as text records

Pets accumulate verifiable credentials over time, each written as an ENS text record:

| Record key | What it represents |
|---|---|
| `tama.belts.debate` | Number of debate battle wins ("1", "2", ...) |
| `tama.belts.joke-duel` | Joke duel wins |
| `tama.friends.mira` | Friendship strength with Mira (1-10) |
| `tama.peerId` | AXL ed25519 pubkey (live discovery) |
| `tama.lastSeenBlock` | Most recent block when worker was alive |
| `tama.blob` | 0G Storage CID for identity blob |
| `tama.children` | Comma-separated list of bred children |

Anyone can prove a pet's full reputation by reading text records — no central server, no trusted indexer.

### Subnames as access tokens for KeeperHub conditional workflows

The cross-time mailbox HERO ([packages/keeperhub/index.ts:184](packages/keeperhub/index.ts#L184)) uses ENS as a gate:

```
EVERY MINUTE:
  read <recipient>.tama.eth's tama.lastSeenBlock
  if (currentBlock - lastSeenBlock < 5 blocks) {
    transfer USDC
  }
```

The recipient's ENS text record is the **trigger condition** for an on-chain action. Subname = liveness proof = access token to receive a queued gift. If you don't update your subname (i.e. don't connect your pet), gifts wait indefinitely.

This directly matches the ENS Most Creative brief: ENS as a primitive in autonomous workflows, not just "user identity."

## Files reviewers should look at

| File | What to look for |
|---|---|
| `contracts/src/TamaPet.sol` | ERC-7857 + ENS subname minting on mint() |
| `packages/ens/src/index.ts` | NameWrapper.setSubnodeRecord, Resolver.setAddr/setText helpers |
| `packages/keeperhub/index.ts:184` | createConditionalMailbox — uses ENS lastSeenBlock as trigger |
| `apps/web/src/components/BreedingFlow.tsx` | Lineage tree UI |
| `packages/pet-runtime/src/worker.ts` | Writes peerId to ENS on boot |

## Demo proof

1. **Live mint** — judge connects wallet, adopts pet "live1". Sepolia tx visible. Then `cast call $RESOLVER "addr(bytes32)" $(cast namehash live1.tama.eth)` returns the pet wallet address.
2. **Mailbox HERO** — recipient `tau.tama.eth`'s `lastSeenBlock` is read inside the KeeperHub workflow. When tau wakes, condition fires, USDC moves.
3. **Breeding** — pair Mira × Rusty → child "pip" mints with subname `pip.mira.tama.eth` (verifiable on Sepolia ENS app).
4. **Battle belts** — winner pet's `tama.belts.debate` text record increments after settle. Anyone can read the pet's belt count from ENS without trusting our database.

## Deployed

- Root: `tama.eth` on Sepolia (NameWrapper)
- NameWrapper: `0x0635513f179D50A207757E05759CbD106d7dFcE8`
- PublicResolver: `0x8FADE66B79cC9f707aB26799354482EB93a5B7dD`
- Approval: `tama.eth` owner has `setApprovalForAll(TamaPet, true)` so the contract can mint subnames during pet mint.

## Disclosure

- Direct usage of Sepolia ENS contracts. No third-party subname services.
- viem's namehash + labelhash utilities used for off-chain lookups.
- No modifications to ENS contracts.
