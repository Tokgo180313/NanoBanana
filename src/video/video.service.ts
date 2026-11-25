import { GenerationModels } from '../model-admin/generation-models.service';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { IamContext } from '../iam/iam-client.service';
import { IamDb } from '../iam/iam-db.service';
import { parseVideoInput } from './video-input';

const ARK_TASKS_URL =
  'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const VIDEO_LINK_LIFETIME = 24 * 60 * 60 * 1000;
const TASK_QUERY_LIFETIME = 7 * VIDEO_LINK_LIFETIME;
const CREATE_TIMEOUT = 30_000;
const PAGE_SIZE = 20;
const upstreamStatuses = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
] as const;
type UpstreamStatus = (typeof upstreamStatuses)[number];
type TaskStatus = UpstreamStatus | 'submitting' | 'submission_unknown';
type VideoTask = {
  id: string;
  tenant_id: number;
  owner_user_id: number;
  created_at: Date;
  upstream_id?: string;
  upstream_updated_at?: number;
  status: TaskStatus;
  prompt: string;
  model: string;
  model_id?: string;
  model_name?: string;
  provider_id?: string;
  provider_version?: number;
  material_roles?: string[];
  duration: number;
  resolution: string;
  ratio: string;
  sound: boolean;
  video_url?: string;
  video_expires_at?: Date;
  error?: string;
};
type ArkTask = {
  id?: string;
  status?: string;
  updated_at?: number;
  content?: { video_url?: string };
  error?: { code?: string; message?: string };
};

const unknownSubmission =
  '提交结果暂无法确认，请刷新任务列表查看，避免重复生成。';
const pending = (status: TaskStatus) =>
  status === 'queued' || status === 'running';

export function requireVideoPermission(context: IamContext) {
  if (!context.permissions.includes('video:task:create')) {
    throw new ForbiddenException('当前账号没有视频生成权限。');
  }
}

function resultUrl(value: unknown) {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      /(?:^|\.)(volces\.com|volcengine\.com)$/.test(url.hostname)
    )
      return value;
  } catch {
    return;
  }
}

@Injectable()
export class VideoService {
  constructor(
    private readonly db: IamDb,
    private readonly config: ConfigService,
    private readonly models: GenerationModels,
  ) {}

  private get tasks() {
    return this.db.collection<VideoTask>('video_tasks');
  }

  private scope(context: IamContext) {
    requireVideoPermission(context);
    return { tenant_id: context.tenant, owner_user_id: context.user };
  }

  private apiKey() {
    const key = this.config.get<string>('ARK_API_KEY')?.trim();
    if (!key)
      throw new ServiceUnavailableException('请先在后端配置 ARK_API_KEY。');
    return key;
  }

  private async viewTask(context: IamContext, id: string) {
    const task = await this.tasks.findOne({ ...this.scope(context), id });
    if (!task) throw new NotFoundException('视频任务不存在。');
    return task;
  }

  private toResult(task: VideoTask) {
    const expiresAt = task.video_expires_at;
    const linkExpired = !!expiresAt && expiresAt.getTime() <= Date.now();
    const staleSubmission =
      task.status === 'submitting' &&
      task.created_at.getTime() + CREATE_TIMEOUT + 15_000 <= Date.now();
    return {
      id: task.id,
      status: staleSubmission ? 'submission_unknown' : task.status,
      prompt: task.prompt,
      model: task.model_name ?? task.model,
      modelId: task.model_id,
      duration: task.duration,
      resolution: task.resolution,
      ratio: task.ratio,
      sound: task.sound,
      createdAt: task.created_at,
      videoUrl: linkExpired ? undefined : task.video_url,
      expiresAt,
      error: staleSubmission ? unknownSubmission : task.error,
    };
  }

  async create(context: IamContext, input: ReturnType<typeof parseVideoInput>) {
    const scope = this.scope(context);
    const { prompt, modelId, ...parameters } = input;
    const route = await this.models.resolve(
      'video',
      modelId,
      modelId === undefined ? { protocol: 'ark', model: '' } : undefined,
    );
    const options = route.capabilities;
    const materialRoles = parameters.content.flatMap((item) =>
      item.type === 'text' ? [] : [item.role],
    );
    if (
      !('resolutions' in options) ||
      !options.resolutions.includes(parameters.resolution) ||
      !options.ratios.includes(parameters.ratio) ||
      parameters.duration < options.minDuration ||
      parameters.duration > options.maxDuration ||
      materialRoles.length > options.maxMaterials
    )
      throw new ConflictException('MODEL_PARAMETERS_CHANGED');
    const { apiUrl, apiKey } = route.connection;
    const model = route.upstreamModelId;
    const task: VideoTask = {
      ...scope,
      id: randomUUID(),
      created_at: new Date(),
      status: 'submitting',
      prompt,
      model,
      model_id: route.id,
      model_name: route.name,
      provider_id: route.providerId,
      provider_version: route.providerVersion,
      material_roles: materialRoles,
      duration: parameters.duration,
      resolution: parameters.resolution,
      ratio: parameters.ratio,
      sound: parameters.generate_audio,
    };
    await this.tasks.insertOne(task);

    let update: Pick<VideoTask, 'status' | 'upstream_id' | 'error'>;
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, ...parameters }),
        redirect: 'error',
        signal: AbortSignal.timeout(CREATE_TIMEOUT),
      });
      if (response.ok) {
        const result = (await response.json()) as ArkTask;
        update =
          typeof result.id === 'string' && result.id.trim()
            ? { status: 'queued', upstream_id: result.id }
            : { status: 'submission_unknown', error: unknownSubmission };
      } else if (response.status === 408 || response.status >= 500) {
        await response.body?.cancel();
        update = { status: 'submission_unknown', error: unknownSubmission };
      } else {
        update = {
          status: 'failed',
          error: await this.creationError(response),
        };
      }
    } catch {
      update = { status: 'submission_unknown', error: unknownSubmission };
    }

    await this.tasks.updateOne({ ...scope, id: task.id }, { $set: update });
    return this.toResult({ ...task, ...update });
  }

  private async creationError(response: Response) {
    if ([401, 403].includes(response.status)) {
      await response.body?.cancel();
      return '方舟鉴权失败或模型未开通，请检查后端 API Key 和模型配置。';
    }
    if (response.status === 429) {
      await response.body?.cancel();
      return '方舟请求过于频繁，请稍后再试。';
    }
    const result = (await response.json().catch(() => null)) as ArkTask | null;
    return (
      this.providerError(result) ??
      `方舟拒绝了生成请求（HTTP ${response.status}）。`
    );
  }

  private providerError(task: ArkTask | null) {
    const code = task?.error?.code;
    if (typeof code === 'string' && /^[\w.-]{1,100}$/.test(code)) {
      return `方舟视频生成失败（${code}）。`;
    }
  }

  async list(context: IamContext, page: number) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) {
      throw new BadRequestException('页码无效。');
    }
    const rows = await this.tasks
      .find(this.scope(context))
      .sort({ created_at: -1, id: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE + 1)
      .toArray();
    return {
      items: rows.slice(0, PAGE_SIZE).map((task) => this.toResult(task)),
      hasMore: rows.length > PAGE_SIZE,
    };
  }

  async detail(context: IamContext, id: string) {
    const task = await this.viewTask(context, id);
    if (!pending(task.status) || !task.upstream_id) return this.toResult(task);

    if (Date.now() - task.created_at.getTime() >= TASK_QUERY_LIFETIME) {
      return this.saveStatus(task, {
        status: 'expired',
        error: '方舟任务已超过查询期限。',
      });
    }
    const { apiUrl, apiKey } =
      task.provider_id && task.provider_version
        ? await this.models.connection(
            task.provider_id,
            task.provider_version,
            'ark',
          )
        : { apiUrl: ARK_TASKS_URL, apiKey: this.apiKey() };
    let result: ArkTask;
    try {
      const response = await fetch(
        `${apiUrl}/${encodeURIComponent(task.upstream_id)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('ARK_STATUS_UNAVAILABLE');
      }
      result = (await response.json()) as ArkTask;
    } catch {
      throw new BadGatewayException('暂时无法查询方舟任务，请稍后重试。');
    }

    const status = upstreamStatuses.find((value) => value === result?.status);
    if (!status || result.id !== task.upstream_id) {
      throw new BadGatewayException('方舟返回了无法识别的任务状态。');
    }
    if (task.status === 'running' && status === 'queued')
      return this.toResult(task);

    const upstreamTime =
      typeof result.updated_at === 'number' &&
      Number.isFinite(result.updated_at) &&
      result.updated_at > 0
        ? Math.min(result.updated_at * 1000, Date.now())
        : undefined;
    const update: Partial<VideoTask> = { status };
    if (upstreamTime !== undefined) {
      if (
        task.upstream_updated_at !== undefined &&
        upstreamTime < task.upstream_updated_at
      )
        return this.toResult(task);
      update.upstream_updated_at = upstreamTime;
    }
    if (status === 'succeeded') {
      const url = resultUrl(result.content?.video_url);
      if (!url)
        throw new BadGatewayException('方舟返回的视频地址无效，请重新查询。');
      update.video_url = url;
      update.video_expires_at = new Date(
        (upstreamTime ?? task.created_at.getTime()) + VIDEO_LINK_LIFETIME,
      );
    } else if (status === 'failed') {
      update.error = this.providerError(result) ?? '方舟视频生成失败。';
    }
    return this.saveStatus(task, update);
  }

  private async saveStatus(task: VideoTask, update: Partial<VideoTask>) {
    const scope = {
      id: task.id,
      tenant_id: task.tenant_id,
      owner_user_id: task.owner_user_id,
    };
    const result = await this.tasks.updateOne(
      {
        ...scope,
        status: task.status,
        upstream_updated_at: task.upstream_updated_at ?? { $exists: false },
      },
      { $set: update },
    );
    if (result.matchedCount) return this.toResult({ ...task, ...update });
    const latest = await this.tasks.findOne(scope);
    if (!latest) throw new NotFoundException('视频任务不存在。');
    return this.toResult(latest);
  }

  async download(context: IamContext, id: string, signal: AbortSignal) {
    const task = await this.viewTask(context, id);
    const url = resultUrl(task.video_url);
    if (!url || task.status !== 'succeeded')
      throw new NotFoundException('视频暂不可下载。');
    if (
      !task.video_expires_at ||
      task.video_expires_at.getTime() <= Date.now()
    ) {
      throw new GoneException('视频链接已过期。');
    }
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
        redirect: 'error',
      });
    } catch {
      throw new BadGatewayException('暂时无法下载视频，请稍后重试。');
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new BadGatewayException('方舟视频下载失败。');
    }
    return response.body;
  }
}
