// Use relative URLs to work with the same domain/server
const API_BASE_URL = '/api';

export async function getBalance(tgId: number) {
  const response = await fetch(`${API_BASE_URL}/balance?tg_id=${tgId}`);
  if (!response.ok) throw new Error('Failed to get balance');
  return response.json();
}

export async function deductCoins(tgId: number, amount: number) {
  const response = await fetch(`${API_BASE_URL}/deduct-coins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tg_id: tgId, amount })
  });
  if (!response.ok) throw new Error('Failed to deduct coins');
  return response.json();
}

export async function addCoins(tgId: number, amount: number) {
  const response = await fetch(`${API_BASE_URL}/add-coins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tg_id: tgId, amount })
  });
  if (!response.ok) throw new Error('Failed to add coins');
  return response.json();
}

export async function getUser(tgId: number) {
  const response = await fetch(`${API_BASE_URL}/user?tg_id=${tgId}`);
  if (!response.ok) throw new Error('Failed to get user');
  return response.json();
}

export async function getServers() {
  const response = await fetch(`${API_BASE_URL}/servers`);
  if (!response.ok) throw new Error('Failed to get servers');
  return response.json();
}

export async function getLeaderboard(limit: number = 100) {
  const response = await fetch(`${API_BASE_URL}/leaderboard?limit=${limit}`);
  if (!response.ok) throw new Error('Failed to get leaderboard');
  return response.json();
}
