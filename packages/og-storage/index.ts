// og-storage — 0G Storage SDK wrapper
// Owner: KARMANAY. Phase 7a (~4h).
//
// Pets store their full identity blob (sprite + memory + personality + traits)
// encrypted on 0G Storage. The blob CID becomes the pet's ERC-7857 intelligence pointer.
//
// Will export:
//   - uploadBlob(data: PetIdentityBlob): Promise<string>      // returns CID
//   - fetchBlob(cid: string): Promise<PetIdentityBlob>
//   - updateBlob(petId, newData): Promise<string>             // re-uploads + returns new CID
//
// Uses @0glabs/0g-ts-sdk. Add the dep when starting Phase 7a:
//   cd packages/og-storage && pnpm add @0glabs/0g-ts-sdk
//
// Reference: build.0g.ai documentation
// Reference: readme_files/petCity_integrastions.md (0G iNFT track angle)

export interface PetIdentityBlob {
  sprite: string         // data URI or URL of pixelated sprite
  archetype: string
  personality: string    // system prompt for LLM
  traits: Record<string, number>
  memorySnapshot: unknown[]  // recent memory entries
  createdAt: number
  updatedAt: number
}

export {}
