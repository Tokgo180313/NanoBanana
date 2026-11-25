import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MysqlService } from './mysql.service';

@Module({
  imports: [ConfigModule],
  providers: [MysqlService],
  exports: [MysqlService],
})
export class MysqlModule {}
