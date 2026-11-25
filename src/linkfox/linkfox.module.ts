import { Ai147Module } from '../ai147/ai147.module';
import { WorkbenchImagesController } from './workbench-images.controller';
import { Module } from '@nestjs/common';
import { LinkfoxController } from './linkfox.controller';
import { LinkfoxService } from './linkfox.service';

@Module({
  imports: [Ai147Module],
  controllers: [LinkfoxController, WorkbenchImagesController],
  providers: [LinkfoxService],
})
export class LinkfoxModule {}
