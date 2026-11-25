/** Test-only server: real OIDC/IAM/MySQL, inert image provider stubs. Never compiled into production dist. */
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { JimengService } from '../src/jimeng/jimeng.service';
import { LinkfoxService } from '../src/linkfox/linkfox.service';
if (process.env.NODE_ENV !== 'test' || process.env.NB_IAM_FIXTURE !== '1')
  throw new Error('Explicit local test environment required');
const pixel =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JimengService)
    .useValue({
      generateImage2: async () => ({ data: [{ b64_json: pixel }] }),
      generateImage: async () => ({
        code: 0,
        data: { task_id: 'fixture-upstream-id' },
      }),
      queryTaskResult: async () => ({
        code: 0,
        data: { images: [], b64_images: [pixel] },
      }),
    })
    .overrideProvider(LinkfoxService)
    .useValue({ getStatus: () => ({ status: 'test' }) })
    .compile();
  const app = module.createNestApplication();
  await app.listen(3100, '127.0.0.1');
  console.log(
    'Local IAM integration fixture ready; no paid providers are called',
  );
})().catch((error) => {
  console.error('Fixture startup failed: ' + error.name + ': ' + error.message);
  process.exitCode = 1;
});
