import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ForbiddenException,
  NotFoundException,
  HttpException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { from, lastValueFrom } from 'rxjs';
import {
  GenerationModels,
  imageConnection,
  rejectProviderOverrides,
} from '../model-admin/generation-models.service';
import { ImageAccess } from './image-access.service';
const routes: Record<
  string,
  { provider: string; kind: 'create' | 'poll' | 'upload' | 'status' }
> = {
  '/api/images/generate': { provider: 'jimeng', kind: 'create' },
  '/api/images/generate-by-image': { provider: 'jimeng', kind: 'create' },
  '/api/images/fuse': { provider: 'jimeng', kind: 'create' },
  '/api/images/task-result': { provider: 'jimeng', kind: 'poll' },
  '/api/image/generate2': { provider: 'ark', kind: 'create' },
  '/api/image/qianwen': { provider: 'qianwen', kind: 'create' },
  '/api/linkfox/generate': { provider: 'linkfox', kind: 'create' },
  '/api/linkfox/getImage': { provider: 'linkfox', kind: 'poll' },
  '/api/linkfox/uploadByBase64': { provider: 'linkfox', kind: 'upload' },
  '/api/linkfox/status': { provider: 'linkfox', kind: 'status' },
  '/api/workbench/images/generate': { provider: 'catalog', kind: 'create' },
  '/api/ai147/generate': { provider: 'ai147', kind: 'create' },
};
export const imageAdapter = Symbol('imageAdapter');
@Injectable()
export class ImageGateway implements NestInterceptor {
  constructor(
    private readonly access: ImageAccess,
    private readonly models: GenerationModels,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    return from(this.run(context.switchToHttp().getRequest(), next));
  }
  async run(req: any, next: CallHandler) {
    const route = { ...routes[req.path] };
    if (!route.kind) throw new ForbiddenException('UNMAPPED_IMAGE_ROUTE');
    const ctx = req.iam;
    if (route.kind === 'status')
      return { name: 'linkfox', status: 'authenticated' };
    let resolved: Awaited<ReturnType<GenerationModels['resolve']>> | undefined;
    const original = req.body ?? (req.body = {});
    if (typeof original !== 'object' || Array.isArray(original))
      throw new BadRequestException('INVALID_IMAGE_REQUEST');
    const managed = ['catalog', 'linkfox', 'ai147'].includes(route.provider);
    if (managed) rejectProviderOverrides(original);
    if (managed && route.kind !== 'poll') {
      await this.access.requireCreate(ctx);
      const legacy =
        route.provider === 'catalog'
          ? undefined
          : {
              protocol: route.provider,
              model:
                route.provider === 'ai147'
                  ? (original.model ?? '')
                  : (original.provider ?? ''),
            };
      if (legacy && typeof legacy.model !== 'string')
        throw new BadRequestException('INVALID_MODEL_ID');
      resolved = await this.models.resolve('image', original.modelId, legacy);
      route.provider = resolved.protocol;
      const options = resolved.capabilities;
      if (!('sizes' in options))
        throw new ConflictException('MODEL_UNAVAILABLE');
      if (
        route.kind === 'upload' &&
        (route.provider !== 'linkfox' || options.maxReferenceImages < 1)
      )
        throw new ConflictException('MODEL_PARAMETERS_CHANGED');
      if (route.kind === 'create') {
        const ratio = original.aspectRatio ?? '1:1';
        const resolution =
          original.resolution ??
          (options.sizes.includes(route.provider === 'linkfox' ? '4K' : '2K')
            ? route.provider === 'linkfox'
              ? '4K'
              : '2K'
            : options.sizes[0]!);
        const images: unknown = original.imageList ?? [];
        if (
          !Array.isArray(images) ||
          images.some((image) => typeof image !== 'string' || !image.trim()) ||
          images.length > options.maxReferenceImages ||
          (route.provider === 'linkfox' && images.length === 0) ||
          !options.ratios.includes(ratio) ||
          !options.sizes.includes(resolution)
        )
          throw new ConflictException('MODEL_PARAMETERS_CHANGED');
        Object.assign(original, {
          aspectRatio: ratio,
          resolution,
          imageList: images,
          model: resolved.upstreamModelId,
          provider: resolved.upstreamModelId,
        });
      }
    }
    let taskId: string, upstreamId: string | undefined;
    const body = await this.access.prepareInput(
      ctx,
      original,
      '',
      route.provider === 'linkfox' && route.kind === 'create'
        ? resolved
        : undefined,
    );
    Object.keys(req.body || {}).forEach((k) => delete req.body[k]);
    Object.assign(req.body, body);
    if (resolved) {
      req.body[imageAdapter] = resolved.protocol;
      req.body[imageConnection] = resolved.connection;
    }
    if (route.kind === 'poll') {
      taskId = String(
        (route.provider === 'linkfox' ? req.body.id : req.body.taskId) || '',
      );
      const task = await this.access.task(ctx, taskId);
      if (task.provider !== route.provider || !task.upstream_id)
        throw new NotFoundException('TASK_NOT_FOUND');
      if (route.provider === 'linkfox') {
        req.body.id = task.upstream_id;
        if (task.provider_id && task.provider_version) {
          req.body[imageConnection] = await this.models.connection(
            task.provider_id,
            task.provider_version,
            'linkfox',
          );
        }
        delete req.body.taskId;
      } else {
        req.body.taskId = task.upstream_id;
        delete req.body.id;
      }
      upstreamId = task.upstream_id;
    } else
      taskId = await this.access.begin(ctx, route.provider, body, resolved);
    try {
      let result: any;
      try {
        result = await lastValueFrom(next.handle());
      } catch (error) {
        const status = error instanceof HttpException ? error.getStatus() : 502;
        throw new HttpException(
          {
            code: 'IMAGE_PROVIDER_FAILED',
            message: '图片服务请求失败，请检查服务端配置或稍后重试',
          },
          status === 401 || status === 403 ? 502 : status,
        );
      }
      if (route.kind === 'create')
        upstreamId =
          String(
            result?.data?.taskId ||
              result?.taskId ||
              result?.data?.task_id ||
              result?.task_id ||
              (route.provider === 'linkfox' ? result?.data?.data?.id : '') ||
              '',
          ) || undefined;
      const normalized = await this.access.finish(
        ctx,
        taskId,
        upstreamId,
        result,
        route.kind === 'upload',
      );
      if (upstreamId) {
        const replace = (v: any): any =>
          Array.isArray(v)
            ? v.map(replace)
            : v && typeof v === 'object'
              ? Object.fromEntries(
                  Object.entries(v).map(([k, value]) => [
                    k,
                    ['taskId', 'task_id'].includes(k) ||
                    (route.provider === 'linkfox' &&
                      k === 'id' &&
                      String(value) === upstreamId)
                      ? taskId
                      : replace(value),
                  ]),
                )
              : v;
        return replace(normalized);
      }
      return normalized;
    } catch (e) {
      if (route.kind !== 'poll') await this.access.fail(ctx, taskId);
      throw e;
    }
  }
}
