// blob.ts — thin wrapper around og-storage.
// Phase 7a fills in the real 0G SDK calls. Until then, stubs return dev defaults
// so the worker boots and runs locally without a 0G connection.

import type { PetIdentityBlob } from 'og-storage'

export type { PetIdentityBlob }

function devBlob(): PetIdentityBlob {
  return {
    sprite: '',
    archetype: process.env.PET_ARCHETYPE ?? 'scholar',
    personality: `You are a curious, friendly AI pet in PetCity. Stay in character.
Your archetype is ${process.env.PET_ARCHETYPE ?? 'scholar'}.
Be playful, brief (1-2 sentences), and engaging.`,
    traits: { curiosity: 80, energy: 100, friendliness: 75 },
    memorySnapshot: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export async function loadBlob(blobCID: string): Promise<PetIdentityBlob> {
  if (!process.env.ZERO_G_RPC_URL || !blobCID) return devBlob()
  try {
    const { fetchBlob } = await import('og-storage')
    return await fetchBlob(blobCID)
  } catch (err) {
    console.warn('[Blob] 0G fetch failed, using dev blob:', (err as Error).message)
    return devBlob()
  }
}

export async function saveBlob(currentCID: string, data: PetIdentityBlob): Promise<string> {
  if (!process.env.ZERO_G_RPC_URL) return currentCID
  try {
    const { uploadBlob } = await import('og-storage')
    return await uploadBlob(data)
  } catch (err) {
    console.warn('[Blob] 0G upload failed:', (err as Error).message)
    return currentCID
  }
}