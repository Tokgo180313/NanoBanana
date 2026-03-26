import { Module } from '@nestjs/common';
import { JimengController } from './jimeng.controller';
import { JimengService } from './jimeng.service';

@Module({
  controllers: [JimengController],
  providers: [JimengService],
})
export class JimengModule {}

