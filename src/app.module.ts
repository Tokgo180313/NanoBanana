import { PromptOptimizerModule } from './prompts/prompt-optimizer.module';
import { ModelAdminModule } from './model-admin/model-admin.module';
import { IamModule } from './iam/iam.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { JimengModule } from './jimeng/jimeng.module';
import { LinkfoxModule } from './linkfox/linkfox.module';
import { VideoModule } from './video/video.module';
import { Ai147Module } from './ai147/ai147.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env.iam', '.env'],
      isGlobal: true,
    }),
    IamModule,
    ModelAdminModule,
    PromptOptimizerModule,
    JimengModule,
    LinkfoxModule,
    Ai147Module,
    VideoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
