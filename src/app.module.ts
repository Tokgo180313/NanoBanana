import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { JimengModule } from './jimeng/jimeng.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
    }),
    JimengModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
