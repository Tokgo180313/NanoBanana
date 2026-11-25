import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { workbenchOrigins } from './iam/workbench-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
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
      });
    }

    return next(err);
  });
  // CORS 配置
  // Use exact configured origins for local and LAN sessions.
  const corsOrigins =
    process.env.CORS_ORIGIN?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ??
    workbenchOrigins(
      process.env.WORKBENCH_ORIGIN || 'http://localhost:5174',
      process.env.WORKBENCH_ORIGINS || '',
    );
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
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
