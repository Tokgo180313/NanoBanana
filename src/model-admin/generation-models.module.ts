import { Global, Module } from '@nestjs/common';
import { MysqlModule } from '../mysql/mysql.module';
import { GenerationModels } from './generation-models.service';

@Global()
@Module({
  imports: [MysqlModule],
  providers: [GenerationModels],
  exports: [GenerationModels, MysqlModule],
})
export class GenerationModelsModule {}
