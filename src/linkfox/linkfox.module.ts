import { Module } from '@nestjs/common';
import { LinkfoxController } from './linkfox.controller';
import { LinkfoxService } from './linkfox.service';

@Module({
  controllers: [LinkfoxController],
  providers: [LinkfoxService],
})
export class LinkfoxModule {}
