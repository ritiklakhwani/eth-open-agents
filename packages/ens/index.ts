// ens — Sepolia ENS NameWrapper helpers for pet subnames
// Owner: Ritik. Filled during Phase 3 (ENS setup).
//
// Will export:
//   - mintPetSubname(petName, walletAddr, peerId, blobCID): registers <name>.tama.eth
//   - readPeerIdFromENS(petName): resolves AXL peerId from text record
//   - setTextRecord(node, key, value)
//   - readTextRecord(node, key)
//   - issueAttestation(fromPet, toPet, claim): writes attestation to ENS records (Most Creative track)

export {}
