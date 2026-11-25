import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module';
import { GenerationModelsModule } from '../model-admin/generation-models.module';
import { PromptOptimizerController } from './prompt-optimizer.controller';
import { PromptOptimizer } from './prompt-optimizer.service';

@Module({
  imports: [IamModule, GenerationModelsModule],
  controllers: [PromptOptimizerController],
  providers: [PromptOptimizer],
})
export class PromptOptimizerModule {}
