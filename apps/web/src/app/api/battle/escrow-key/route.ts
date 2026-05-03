// GET /api/battle/escrow-key?battleId=… — canonical BattleEscrow bytes32 from Hub string id.
import { battleIdToEscrowKey } from 'contracts-sdk'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const battleId = searchParams.get('battleId')?.trim()
  if (!battleId) {
    return Response.json({ error: 'battleId query parameter required' }, { status: 400 })
  }
  const escrowBattleKey = battleIdToEscrowKey(battleId)
  return Response.json({ battleId, escrowBattleKey })
}
