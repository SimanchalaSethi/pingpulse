import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/postgres';
import { User } from '../types';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

export interface TokenPayload {
  userId: string;
  workspaceId: string;
  role: string;
}

export class AuthService {
  async register(email: string, password: string): Promise<{ user: User; token: string }> {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const workspaceId = uuidv4();
    const userId = uuidv4();

    // Create workspace and user in a transaction
    await pool.query('BEGIN');
    try {
      await pool.query(
        'INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, NOW())',
        [workspaceId, `${email}'s workspace`]
      );
      await pool.query(
        `INSERT INTO users (id, email, password_hash, workspace_id, role, created_at)
         VALUES ($1, $2, $3, $4, 'admin', NOW())`,
        [userId, email, passwordHash, workspaceId]
      );
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }

    const user: User = {
      id: userId,
      email,
      workspaceId,
      role: 'admin',
      createdAt: new Date().toISOString(),
    };

    const token = this.signToken({ userId, workspaceId, role: 'admin' });
    return { user, token };
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const result = await pool.query(
      'SELECT id, email, password_hash, workspace_id, role, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    const row = result.rows[0];
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    const user: User = {
      id: row.id,
      email: row.email,
      workspaceId: row.workspace_id,
      role: row.role,
      createdAt: row.created_at.toISOString(),
    };

    return { user, token: this.signToken({ userId: user.id, workspaceId: user.workspaceId, role: user.role }) };
  }

  async validateToken(token: string): Promise<TokenPayload> {
    try {
      return jwt.verify(token, JWT_SECRET) as TokenPayload;
    } catch {
      throw Object.assign(new Error('Invalid or expired token'), { statusCode: 401 });
    }
  }

  async validateApiKey(rawKey: string): Promise<TokenPayload> {
    // API keys are stored hashed; we hash the incoming key and compare
    const keyHash = await bcrypt.hash(rawKey, 10);
    // We store a prefix to find the right row without scanning all keys
    const prefix = rawKey.substring(0, 8);
    const result = await pool.query(
      `SELECT ak.id, ak.workspace_id, ak.key_hash, ak.is_active
       FROM api_keys ak
       WHERE ak.key_prefix = $1 AND ak.is_active = true`,
      [prefix]
    );

    for (const row of result.rows) {
      const match = await bcrypt.compare(rawKey, row.key_hash);
      if (match) {
        await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id]);
        return { userId: '', workspaceId: row.workspace_id, role: 'member' };
      }
    }

    throw Object.assign(new Error('Invalid API key'), { statusCode: 401 });
  }

  async createApiKey(workspaceId: string, name: string): Promise<{ id: string; key: string }> {
    const rawKey = `pp_${uuidv4().replace(/-/g, '')}`;
    const keyHash = await bcrypt.hash(rawKey, 10);
    const prefix = rawKey.substring(0, 8);
    const id = uuidv4();

    await pool.query(
      `INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())`,
      [id, workspaceId, name, prefix, keyHash]
    );

    // Return raw key only once — it's never stored in plaintext
    return { id, key: rawKey };
  }

  async listApiKeys(workspaceId: string): Promise<Array<{ id: string; name: string; lastUsedAt?: string; createdAt: string }>> {
    const result = await pool.query(
      'SELECT id, name, last_used_at, created_at FROM api_keys WHERE workspace_id = $1 AND is_active = true ORDER BY created_at DESC',
      [workspaceId]
    );
    return result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      lastUsedAt: r.last_used_at?.toISOString(),
      createdAt: r.created_at.toISOString(),
    }));
  }

  async revokeApiKey(keyId: string, workspaceId: string): Promise<void> {
    await pool.query(
      'UPDATE api_keys SET is_active = false WHERE id = $1 AND workspace_id = $2',
      [keyId, workspaceId]
    );
  }

  private signToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
  }
}
