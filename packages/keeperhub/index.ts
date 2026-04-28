// keeperhub — KeeperHub workflow SDK exposing the 5 primitives
// Owner: Ritik. Phase 8 (~8h). Karmanay's Hub imports from this package.
//
// Primitives:
//   1. createRecurringAllowance({ owner, pet, amountUSDC, cron })
//   2. createScheduledGift({ from, to, amountUSDC, fireAt })
//   3. createMailboxWorkflow({ from, to, gift })          // HERO — conditional on lastSeenBlock
//   4. createBattleEscrowRelease({ battleId, judgeContract })  // event-listener
//   5. createAdoptionTransferChain({ tokenId })           // chained: ENS update + USDC sweep
//
// Plus:
//   - createSubscriptionCancellation(owner, subId, fireAt)
//
// Connection: org-scoped API key via KEEPERHUB_API_KEY env (kh_ prefix).
// Endpoint: https://app.keeperhub.com/api or MCP at https://app.keeperhub.com/mcp.
//
// Reference: readme_files/keeperhub.md

export {}
