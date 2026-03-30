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
  // Better error messages when request body cannot be parsed.
  // This helps diagnose "Error when parsing request" on different platforms (Windows, etc).
  app.use((err: any, req: any, res: any, next: any) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        code: 413,
        message: 'Request body too large',
        limit: bodyLimit,
      });
    }

    // Invalid JSON (e.g. base64 contains unescaped characters, or Content-Type is wrong)
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid JSON in request body',
        error: err.message,
      });
    }

    return next(err);
  });
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
