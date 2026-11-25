import { Module } from '@nestjs/common';
import { GenerationModelsModule } from './generation-models.module';
import { ModelAdminController } from './model-admin.controller';
import { ModelCatalogController } from './model-catalog.controller';
import { ModelAdminService } from './model-admin.service';

@Module({
  imports: [GenerationModelsModule],
  controllers: [ModelAdminController, ModelCatalogController],
  providers: [ModelAdminService],
})
export class ModelAdminModule {}
