import { Router, Request, Response } from 'express';
import { getUser, updateUserCoins, setUserCoins } from '../db/users.js';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get user balance
router.get('/balance', async (req: Request, res: Response) => {
  try {
    const tgId = req.query.tg_id as string;
    
    if (!tgId) {
      return res.status(400).json({ error: 'tg_id is required' });
    }

    const user = await getUser(parseInt(tgId));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      coins: user.coins,
      totalEarned: user.total_earned,
      gamesPlayed: user.games_played,
      highestScore: user.highest_score
    });
  } catch (error) {
    logger.error('Error getting balance', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile
router.get('/user', async (req: Request, res: Response) => {
  try {
    const tgId = req.query.tg_id as string;
    
    if (!tgId) {
      return res.status(400).json({ error: 'tg_id is required' });
    }

    const user = await getUser(parseInt(tgId));
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      tgId: user.tg_id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      coins: user.coins,
      totalEarned: user.total_earned,
      gamesPlayed: user.games_played,
      highestScore: user.highest_score,
      createdAt: user.created_at
    });
  } catch (error) {
    logger.error('Error getting user', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deduct coins (for starting a game)
router.post('/deduct-coins', async (req: Request, res: Response) => {
  try {
    const { tg_id, amount } = req.body;
    
    if (!tg_id || !amount) {
      return res.status(400).json({ error: 'tg_id and amount are required' });
    }

    const user = await getUser(tg_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.coins < amount) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }

    const updated = await updateUserCoins(tg_id, -amount);
    
    res.json({
      coins: updated.coins,
      message: `Deducted ${amount} coins`
    });
  } catch (error) {
    logger.error('Error deducting coins', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add coins (game earnings)
router.post('/add-coins', async (req: Request, res: Response) => {
  try {
    const { tg_id, amount } = req.body;
    
    if (!tg_id || !amount) {
      return res.status(400).json({ error: 'tg_id and amount are required' });
    }

    const user = await getUser(tg_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updated = await updateUserCoins(tg_id, amount);
    
    res.json({
      coins: updated.coins,
      message: `Added ${amount} coins`
    });
  } catch (error) {
    logger.error('Error adding coins', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get game servers list
router.get('/servers', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM game_servers WHERE player_count < max_players ORDER BY player_count DESC`
    );

    res.json({
      servers: result.rows
    });
  } catch (error) {
    logger.error('Error getting servers', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    
    const result = await query(
      `SELECT tg_id, username, first_name, coins, total_earned, highest_score, games_played
       FROM users
       ORDER BY total_earned DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      leaderboard: result.rows
    });
  } catch (error) {
    logger.error('Error getting leaderboard', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
