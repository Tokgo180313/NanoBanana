import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Request body size limit (MB), configurable via env.
  const bodyLimitMb = Number(process.env.BODY_LIMIT_MB ?? '10');
  const bodyLimit =
    Number.isFinite(bodyLimitMb) && bodyLimitMb > 0
      ? `${bodyLimitMb}mb`
      : '10mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  // CORS 配置
  // - 默认允许所有来源（便于前期联调）
  // - 若要限制来源：设置环境变量 `CORS_ORIGIN="http://a.com,http://b.com"`
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Allow-Headers',
      'Access-Control-Request-Method',
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
  await app.listen(process.env.PORT ?? 3000);

}
bootstrap();
