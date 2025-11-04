const TONAPI_KEY = process.env.TONAPI_KEY;
const GAME_TON_ADDRESS = process.env.GAME_TON_ADDRESS;

if (!TONAPI_KEY) console.warn('TONAPI_KEY not set; TON API requests will fail');
if (!GAME_TON_ADDRESS) console.warn('GAME_TON_ADDRESS not set');

async function fetchTonApi(path) {
  const base = 'https://tonapi.io';
  const url = base + path;
  const headers = { 'Content-Type': 'application/json' };
  if (TONAPI_KEY) headers['x-api-key'] = TONAPI_KEY;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`TonAPI error ${res.status}: ${t}`);
  }
  return res.json();
}

// Get balance (TON) for an address. Returns number of TON (float)
async function getAddressBalance(address) {
  try {
    // TonAPI getAddressInfo
    const data = await fetchTonApi(`/v1/blockchain/getAddressInfo?address=${encodeURIComponent(address)}`);
    // Response may contain data.balance or result.balance or account.balance
    let balance = null;
    if (data && data.balance !== undefined) balance = data.balance;
    if (data && data.result && data.result.balance !== undefined) balance = data.result.balance;
    if (data && data.account && data.account.balance !== undefined) balance = data.account.balance;
    // balance maybe in nanotons (1 TON = 1e9), try to normalize
    if (balance === null) return 0;
    const b = Number(balance);
    if (b > 1e12) {
      // probably in nanotons
      return b / 1e9;
    }
    return b;
  } catch (e) {
    console.error('getAddressBalance error', e.message);
    return 0;
  }
}

// Find deposits to GAME_TON_ADDRESS from a given sender address since timestamp (ms)
async function findDepositsFrom(senderAddress, sinceMs = 0) {
  if (!GAME_TON_ADDRESS) throw new Error('GAME_TON_ADDRESS not configured');
  // Try to fetch recent transactions for GAME_TON_ADDRESS and filter by sender
  try {
    const data = await fetchTonApi(`/v1/blockchain/getTransactions?address=${encodeURIComponent(GAME_TON_ADDRESS)}&limit=200`);
    const txs = data && (data.transactions || data.result || data.items || data.data) || [];
    const found = [];
    for (const tx of txs) {
      try {
        // tx structure varies. Normalize: look for incoming transfer from senderAddress
        // Check fields commonly: tx.in_msg.from, tx.in_msg.value
        const in_msg = tx.in_msg || (tx.in_message && tx.in_message.source) ? tx.in_msg || tx.in_message : null;
        // older tonapi may have 'from' and 'value' directly
        const from = (in_msg && (in_msg.from || in_msg.source)) || tx.from || tx.src || null;
        const value = (in_msg && (in_msg.value || in_msg.amount)) || tx.value || tx.amount || null;
        const lt = tx.utime || tx.time || tx.created_at || tx.date;
        const ts = lt ? (Number(lt) * 1000) : 0;
        if (!from || !value) continue;
        if (senderAddress && from.toLowerCase() !== senderAddress.toLowerCase()) continue;
        if (sinceMs && ts < sinceMs) continue;
        // value normalization
        const valNum = Number(value);
        const tonValue = valNum > 1e12 ? valNum / 1e9 : valNum;
        found.push({ from, value: tonValue, ts, tx });
      } catch (e) {
        continue;
      }
    }
    return found;
  } catch (e) {
    console.error('findDepositsFrom error', e.message);
    return [];
  }
}

module.exports = { getAddressBalance, findDepositsFrom };
