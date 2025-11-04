import { query } from './connection.js';

export interface User {
  id: number;
  tg_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  coins: number;
  total_earned: number;
  games_played: number;
  highest_score: number;
  created_at: Date;
  updated_at: Date;
}

export async function getOrCreateUser(tgId: number, userData?: {
  username?: string;
  first_name?: string;
  last_name?: string;
}): Promise<User> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE tg_id = $1',
      [tgId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Create new user
    const createResult = await query(
      `INSERT INTO users (tg_id, username, first_name, last_name) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [tgId, userData?.username, userData?.first_name, userData?.last_name]
    );

    return createResult.rows[0];
  } catch (error) {
    console.error('Error getting or creating user:', error);
    throw error;
  }
}

export async function getUser(tgId: number): Promise<User | null> {
  try {
    const result = await query(
      'SELECT * FROM users WHERE tg_id = $1',
      [tgId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

export async function updateUserCoins(tgId: number, coins: number): Promise<User> {
  try {
    const result = await query(
      `UPDATE users SET coins = coins + $1, updated_at = NOW() 
       WHERE tg_id = $2 
       RETURNING *`,
      [coins, tgId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error updating user coins:', error);
    throw error;
  }
}

export async function setUserCoins(tgId: number, coins: number): Promise<User> {
  try {
    const result = await query(
      `UPDATE users SET coins = $1, updated_at = NOW() 
       WHERE tg_id = $2 
       RETURNING *`,
      [coins, tgId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error setting user coins:', error);
    throw error;
  }
}

export async function updateGameStats(tgId: number, earnings: number, score: number): Promise<User> {
  try {
    const result = await query(
      `UPDATE users 
       SET total_earned = total_earned + $1,
           games_played = games_played + 1,
           highest_score = GREATEST(highest_score, $2),
           updated_at = NOW()
       WHERE tg_id = $3 
       RETURNING *`,
      [earnings, score, tgId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error updating game stats:', error);
    throw error;
  }
}
