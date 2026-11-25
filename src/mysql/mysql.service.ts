import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, type Pool } from 'mysql2/promise';

@Injectable()
export class MysqlService implements OnModuleInit, OnModuleDestroy {
  private pool?: Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.config.get<string>('NB_MYSQL_URI');
    if (!uri) return;

    try {
      this.pool = createPool({
        uri,
        connectionLimit: 10,
        queueLimit: 50,
        connectTimeout: 5000,
        charset: 'utf8mb4',
        timezone: 'Z',
      });
      await this.pool.query('SELECT 1');
    } catch (error) {
      await this.onModuleDestroy();
      const code = (error as { code?: string }).code;
      throw new Error(
        `Model management MySQL connection failed (${code ?? 'invalid configuration'})`,
      );
    }
  }

  get connection(): Pool {
    if (!this.pool) throw new Error('NB_MYSQL_URI is not configured');
    return this.pool;
  }

  async onModuleDestroy(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;
    await pool?.end();
  }
}
