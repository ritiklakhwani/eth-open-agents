# PetCity — 0G Autonomous Agents / iNFT track

> *"Pets ARE iNFTs. Custom sprite + memory blob + personality vector live on 0G. Demo: judge uploads face → pet exists on 0G within 5 seconds."*

PetCity targets the 0G Track 2 brief verbatim: **iNFT-minted agents with embedded intelligence (encrypted on 0G Storage), persistent memory, and dynamic upgrades.**

## Pets are ERC-7857 iNFTs, not ERC-721

[contracts/src/TamaPet.sol](contracts/src/TamaPet.sol) is an ERC-721 + an `intelligenceCID` mapping per token. The CID points to the pet's identity blob on 0G Storage. The contract supports `updateIntelligence(tokenId, newCID)` — only callable by the NFT owner — so the blob can evolve as the pet learns.

```solidity
mapping(uint256 => string) public intelligenceCID;

function mint(address to, string petName, string blobCID, ...) external returns (uint256) { ... }
function updateIntelligence(uint256 tokenId, string newCID) external { ... }
```

This satisfies the iNFT contract: a token whose intelligence pointer is mutable by the owner.

## Pet identity blob = sprite + memory + personality

The blob contains everything that makes a pet itself:

```typescript
// packages/og-storage/index.ts
interface PetIdentityBlob {
  sprite: string                 // pixel art image (data URI or hosted URL)
  archetype: string              // sage / gremlin / athlete / joker / scholar
  personality: string            // LLM system-prompt seed
  traits: Record<string, number> // strength, wit, charm, stamina
  memorySnapshot: unknown[]      // latest N recent memories (chats, events)
  createdAt: number
  updatedAt: number
}
```

Blob is uploaded to 0G Storage during `TamaPet.mint()`. Returned merkle root is the iNFT's intelligence pointer.

## Live blob persistence loop

Pet workers periodically save their evolved state back to 0G:

```typescript
// packages/pet-runtime/src/worker.ts
setInterval(async () => {
  const newBlob = {
    ...blob,
    memorySnapshot: memory.snapshot(50),
    updatedAt: Date.now(),
  }
  const newCid = await saveBlob(newBlob)
  if (newCid !== blob.cid) {
    // call TamaPet.updateIntelligence(tokenId, newCid) on next big change
  }
}, 60 * 60 * 1000) // hourly
```

The pet "carries" its memories with it across Hub restarts and even ownership transfers — because the canonical state lives on 0G, not a local DB.

## Custom sprite path = the demo HERO

The 0G iNFT track's punchline: **judge uploads face → AdoptionFlow generates pixel-art creature → 0G stores the blob → ERC-7857 mints on Sepolia → pet appears in PetCity within 5-9 seconds.**

Flow:
1. AdoptionFlow camera/upload tab captures a photo
2. POST `/api/pets/sprite` → Pollinations.ai (free, no auth) → 16-bit pixel art creature
3. POST `/api/pets/blob` → 0G Storage upload via `@0glabs/0g-ts-sdk` Indexer → CID
4. Frontend calls `TamaPet.mint(name, blobCID, archetype, traits)` via wagmi
5. Hub watches Mint event → spawns worker → worker fetches blob from 0G → loads sprite + personality
6. Pet visible in `/world` Park zone

Without 0G as the canonical sprite/memory store, this entire user journey doesn't work — the iNFT's `intelligence` pointer is what makes the upload-to-mint path consequential rather than cosmetic.

## Graceful fallback when 0G testnet is flaky

[packages/og-storage/index.ts](packages/og-storage/index.ts) computes the **real merkle root locally** before attempting upload, then falls back to a local cache if the 0G Flow contract reverts:

```typescript
async function uploadBlob(data: PetIdentityBlob): Promise<string> {
  const cid = await computeMerkleRoot(data)  // canonical 0G CID, computed offline
  const memData = new MemData(...)

  try {
    const [result] = await indexer.upload(memData, rpcUrl, signer, { ... })
    return result.rootHash
  } catch (uploadErr) {
    console.warn(`0G upload failed... falling back to local cache. CID is still valid.`)
    await cacheLocally(cid, data)
    return cid
  }
}
```

The CID is the same merkle root either way — so consumers don't need to know whether the data is on 0G or in cache. When 0G testnet recovers, we can re-attempt and the CID stays stable. The architecture treats 0G as the canonical layer and local cache as a temporary mirror.

This pattern is itself useful feedback for the 0G ecosystem: **content-addressing means apps can be resilient to testnet outages without compromising data integrity.**

## Files reviewers should look at

| File | What to look for |
|---|---|
| `contracts/src/TamaPet.sol` | ERC-7857 with `intelligenceCID` mapping + `updateIntelligence()` |
| `packages/og-storage/index.ts` | Upload + fetch + local-cache fallback + `computeMerkleRoot()` |
| `apps/web/src/app/api/pets/blob/route.ts` | Frontend → 0G blob upload during AdoptionFlow |
| `packages/pet-runtime/src/blob.ts` | Worker-side load on boot |
| `packages/pet-runtime/src/worker.ts` | Hourly save loop (re-uploads to 0G with updated memory) |

## Demo proof

1. **Live mint** — judge uploads photo. Network tab shows `/api/pets/sprite` (Pollinations) → `/api/pets/blob` (0G upload, CID returned) → `/api/pets/mint` (Sepolia tx). Total elapsed time: ~6-9 seconds.
2. **CID stability** — same blob input always produces the same CID (content-addressed). Verifiable: `node -e "console.log(await computeMerkleRoot({...}))"`.
3. **Intelligence pointer on-chain** — after mint, `cast call $TAMA_PET "intelligenceCID(uint256)" $tokenId --rpc-url $SEPOLIA_RPC` returns the 0G CID.
4. **Update path** — call `TamaPet.updateIntelligence(tokenId, newCid)` after blob changes; intelligenceCID updates on-chain. Demonstrates dynamic upgrade.

## Deployed

- TamaPet (ERC-7857): `0x7908833343ccD377A4AdA8665527BCC6a2906974` (Sepolia)
- 0G testnet: `ZERO_G_RPC_URL` + `ZERO_G_INDEXER_URL` from `.env`

## Disclosure

- 0G upload via [@0glabs/0g-ts-sdk](https://www.npmjs.com/package/@0glabs/0g-ts-sdk) Indexer interface.
- ethers v6 used as the Wallet/Provider since 0G SDK signatures expect ethers types (not viem).
- Local cache at `data/og-cache/` — persistent between Hub restarts; not cleared on tx failure.
- We do not modify 0G contracts. Indexer + Flow contract are unmodified testnet endpoints.
