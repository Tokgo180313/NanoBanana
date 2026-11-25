import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { IamDb } from './iam-db.service';
import { IamClient, type IamContext } from './iam-client.service';
import { ImageStorage } from './image-storage.service';
@Injectable()
export class ImageAccess {
  constructor(
    private readonly db: IamDb,
    private readonly iam: IamClient,
    private readonly storage: ImageStorage,
  ) {}
  async task(ctx: IamContext, id: string, action = 'view') {
    const row = await this.db
      .collection('image_tasks')
      .findOne({ tenant_id: ctx.tenant, id });
    if (!row) throw new NotFoundException('TASK_NOT_FOUND');
    await this.iam.require(ctx, 'IMAGE_TASK', id, action);
    return row;
  }
  async register(ctx: IamContext, type: string, id: string) {
    const filter = {
      tenant_id: ctx.tenant,
      resource_type: type,
      resource_key: id,
    };
    try {
      await this.iam.register(ctx, type, id);
      await this.db
        .collection('iam_outbox')
        .updateOne(filter, { $set: { status: 'DONE' }, $inc: { attempts: 1 } });
    } catch (e) {
      await this.db
        .collection('iam_outbox')
        .updateOne(filter, { $inc: { attempts: 1 } });
      throw e;
    }
  }
  private async enqueue(ctx: IamContext, type: string, id: string) {
    const filter = {
      tenant_id: ctx.tenant,
      resource_type: type,
      resource_key: id,
    };
    await this.db.collection('iam_outbox').updateOne(
      filter,
      {
        $setOnInsert: {
          ...filter,
          payload: {
            appCode: 'image-workbench',
            resourceType: type,
            resourceKey: id,
          },
          status: 'PENDING',
          attempts: 0,
          created_at: new Date(),
        },
      },
      { upsert: true },
    );
    await this.register(ctx, type, id);
  }
  requireCreate(ctx: IamContext) {
    return this.iam.require(ctx, 'IMAGE_TASK', null, 'create');
  }
  async begin(
    ctx: IamContext,
    provider: string,
    body: any,
    modelRoute?: {
      id: string;
      name: string;
      providerId: string;
      providerVersion: number;
      upstreamModelId: string;
    },
  ) {
    if (!modelRoute) await this.requireCreate(ctx);
    const id = 'nb-task-' + randomUUID();
    const prompt = String(
      body.prompt ??
        body.input?.messages
          ?.flatMap((m) => m.content || [])
          .map((c) => c.text || '')
          .join(' ') ??
        '',
    ).slice(0, 20000);
    const model =
      modelRoute?.name ??
      String(body.model || body.provider || provider).slice(0, 100);
    const settings = {
      modelName: modelRoute?.id ?? model,
      imageRatio: String(body.aspectRatio || ''),
      imageSize: String(body.size || body.resolution || ''),
    };
    await this.db.collection('image_tasks').insertOne({
      id,
      tenant_id: ctx.tenant,
      owner_user_id: ctx.user,
      provider,
      prompt,
      model,
      settings,
      ...(modelRoute && {
        model_id: modelRoute.id,
        model_name: modelRoute.name,
        provider_id: modelRoute.providerId,
        provider_version: modelRoute.providerVersion,
        upstream_model_id: modelRoute.upstreamModelId,
        output_count: body.outputNum ?? 1,
        reference_count: body.imageList?.length ?? 0,
      }),
      status: 'REGISTERING',
      created_at: new Date(),
    });
    await this.enqueue(ctx, 'IMAGE_TASK', id);
    await this.db
      .collection('image_tasks')
      .updateOne(
        { tenant_id: ctx.tenant, id },
        { $set: { status: 'RUNNING' } },
      );
    return id;
  }
  async asset(ctx: IamContext, id: string, action = 'view') {
    const row = await this.db
      .collection('image_assets')
      .findOne({ tenant_id: ctx.tenant, id, status: 'ACTIVE' });
    if (!row) throw new NotFoundException('ASSET_NOT_FOUND');
    await this.iam.require(ctx, 'IMAGE_ASSET', id, action);
    return row;
  }
  async storeAsset(ctx: IamContext, taskId: string, source: string) {
    const filter = {
      tenant_id: ctx.tenant,
      task_id: taskId,
      source_hash: createHash('sha256').update(source).digest('hex'),
    };
    let row = await this.db.collection('image_assets').findOne(filter);
    if (!row) {
      const task = await this.db
        .collection('image_tasks')
        .findOne({ tenant_id: ctx.tenant, id: taskId });
      if (!task) throw new NotFoundException('TASK_NOT_FOUND');
      // Stable ID makes retries and concurrent callbacks use the same file.
      const id =
        'nb-asset-' +
        createHash('sha256').update(JSON.stringify(filter)).digest('hex');
      try {
        await this.db.collection('image_assets').updateOne(
          filter,
          {
            $setOnInsert: {
              ...filter,
              id,
              owner_user_id: task.owner_user_id,
              status: 'STORING',
              created_at: new Date(),
            },
          },
          { upsert: true },
        );
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
      row = await this.db.collection('image_assets').findOne(filter);
    }
    if (!row || row.status === 'DELETED' || row.status === 'UNAVAILABLE')
      throw new NotFoundException('ASSET_NOT_FOUND');
    if (row.status !== 'ACTIVE') {
      if (Number(row.owner_user_id) !== ctx.user)
        throw new ConflictException('OWNER_REGISTRATION_PENDING');
      if (!row.storageKey) {
        const stored = await this.storage.save(
          ctx.tenant,
          taskId,
          row.id,
          source,
        );
        await this.db.collection('image_assets').updateOne(
          { ...filter, status: { $in: ['STORING', 'REGISTERING'] } },
          {
            $set: { ...stored, status: 'REGISTERING' },
          },
        );
      }
      await this.enqueue(ctx, 'IMAGE_ASSET', row.id);
      await this.db
        .collection('image_assets')
        .updateOne(
          { ...filter, status: 'REGISTERING' },
          { $set: { status: 'ACTIVE' } },
        );
    }
    // A concurrent delete must not be resurrected by a late provider response.
    const active = await this.db
      .collection('image_assets')
      .findOne({ ...filter, status: 'ACTIVE' });
    if (!active) throw new ConflictException('ASSET_NOT_ACTIVE');
    return '/api/workbench/assets/' + row.id + '/preview';
  }
  async normalize(
    ctx: IamContext,
    taskId: string,
    value: any,
    key = '',
  ): Promise<any> {
    const binary = new Set(['binary_data_base64', 'b64_images', 'b64_json']);
    const urls = new Set([
      'url',
      'image_url',
      'imageUrl',
      'image_urls',
      'images',
      'viewUrl',
      'image',
    ]);
    if (typeof value === 'string' && (binary.has(key) || urls.has(key))) {
      if (binary.has(key))
        return this.storeAsset(
          ctx,
          taskId,
          value.startsWith('data:') ? value : 'data:image/png;base64,' + value,
        );
      if (/^https:\/\//i.test(value) || value.startsWith('data:image/'))
        return this.storeAsset(ctx, taskId, value);
      if (/^http:\/\//i.test(value))
        throw new ForbiddenException('INSECURE_IMAGE_SOURCE');
      return value;
    }
    if (Array.isArray(value))
      return Promise.all(value.map((v) => this.normalize(ctx, taskId, v, key)));
    if (value && typeof value === 'object') {
      const output: any = {};
      for (const [k, v] of Object.entries(value)) {
        if (k === 'raw') continue;
        let target = k;
        if (k === 'binary_data_base64') target = 'image_urls';
        if (k === 'b64_images') target = 'images';
        if (k === 'b64_json') target = 'url';
        const normalized = await this.normalize(ctx, taskId, v, k);
        output[target] =
          Array.isArray(output[target]) && Array.isArray(normalized)
            ? [...output[target], ...normalized]
            : normalized;
      }
      return output;
    }
    return value;
  }
  async prepareInput(
    ctx: IamContext,
    value: any,
    key = '',
    linkfox?: { providerId: string; providerVersion: number },
  ): Promise<any> {
    if (
      [
        'apiKey',
        'endpoint',
        'baseUrl',
        'apiUrl',
        '__proto__',
        'constructor',
        'prototype',
      ].includes(key)
    )
      throw new BadRequestException('PROVIDER_CREDENTIAL_OVERRIDE_FORBIDDEN');
    if (
      typeof value === 'string' &&
      value.startsWith('/api/workbench/assets/')
    ) {
      const id = value.match(
        /^\/api\/workbench\/assets\/([^/]+)\/preview$/,
      )?.[1];
      if (!id) throw new BadRequestException();
      const row = await this.asset(ctx, id);
      if (key === 'imageList' && linkfox) {
        const upload = await this.task(ctx, row.task_id);
        if (
          upload.provider_id !== linkfox.providerId ||
          upload.provider_version !== linkfox.providerVersion ||
          upload.upload_asset_id !== id ||
          typeof upload.upload_source !== 'string'
        )
          throw new ConflictException('MODEL_PARAMETERS_CHANGED');
        return upload.upload_source;
      }
      const bytes = await this.storage.read(row as any);
      return `data:${row.mimeType};base64,${bytes.toString('base64')}`;
    }
    if (Array.isArray(value))
      return Promise.all(
        value.map((v) => this.prepareInput(ctx, v, key, linkfox)),
      );
    if (value && typeof value === 'object') {
      const result: any = {};
      for (const [k, v] of Object.entries(value))
        result[k] = await this.prepareInput(ctx, v, k, linkfox);
      // Jimeng has separate URL and binary fields. Local files cannot be fetched by its servers.
      if (
        typeof result.imageUrl === 'string' &&
        result.imageUrl.startsWith('data:image/')
      ) {
        result.imageBase64 = result.imageUrl;
        delete result.imageUrl;
      }
      if (
        Array.isArray(result.imageUrls) &&
        result.imageUrls.length &&
        result.imageUrls.every(
          (v) => typeof v === 'string' && v.startsWith('data:image/'),
        )
      ) {
        result.imageBase64List = [
          ...(result.imageBase64List || []),
          ...result.imageUrls,
        ];
        delete result.imageUrls;
      }
      return result;
    }
    return value;
  }
  async finish(
    ctx: IamContext,
    id: string,
    upstreamId: string | undefined,
    result: any,
    isUpload = false,
  ) {
    const filter = { tenant_id: ctx.tenant, id };
    if (upstreamId)
      await this.db
        .collection('image_tasks')
        .updateOne(filter, { $set: { upstream_id: upstreamId } });
    const normalized = await this.normalize(ctx, id, result);
    if (isUpload) {
      const source: unknown = result?.data?.data?.viewUrl;
      const url: unknown = normalized?.data?.data?.viewUrl;
      const assetId =
        typeof url === 'string'
          ? /^\/api\/workbench\/assets\/([^/]+)\/preview$/.exec(url)?.[1]
          : undefined;
      if (
        assetId &&
        typeof source === 'string' &&
        source.startsWith('https://')
      ) {
        await this.db.collection('image_tasks').updateOne(filter, {
          $set: { upload_source: source, upload_asset_id: assetId },
        });
      }
    }
    const count = await this.db
      .collection('image_assets')
      .countDocuments({ tenant_id: ctx.tenant, task_id: id, status: 'ACTIVE' });
    await this.db.collection('image_tasks').updateOne(filter, {
      $set: {
        status: count ? 'SUCCEEDED' : upstreamId ? 'PENDING' : 'FAILED',
      },
    });
    return normalized;
  }
  async fail(ctx: IamContext, id: string) {
    await this.db
      .collection('image_tasks')
      .updateOne({ tenant_id: ctx.tenant, id }, { $set: { status: 'FAILED' } });
  }
  async retryRegistration(ctx: IamContext, id: string) {
    const row = await this.db
      .collection('image_tasks')
      .findOne({ tenant_id: ctx.tenant, id, owner_user_id: ctx.user });
    if (!row) throw new NotFoundException();
    if (row.status !== 'REGISTERING')
      throw new ConflictException('REGISTRATION_NOT_PENDING');
    await this.iam.require(ctx, 'IMAGE_TASK', null, 'create');
    await this.enqueue(ctx, 'IMAGE_TASK', id);
    await this.db
      .collection('image_tasks')
      .updateOne({ tenant_id: ctx.tenant, id }, { $set: { status: 'FAILED' } });
    return {
      registered: true,
      generationStarted: false,
      message: '权限索引已恢复，可重新发起生成',
    };
  }
  async list(ctx: IamContext, kind: 'tasks' | 'assets', query: any) {
    if (
      !ctx.permissions.includes('image:task:list') ||
      (kind === 'assets' && !ctx.permissions.includes('image:asset:view'))
    )
      throw new ForbiddenException();
    const collection = this.db.collection(
      kind === 'tasks' ? 'image_tasks' : 'image_assets',
    );
    const visible =
      kind === 'assets'
        ? { status: 'ACTIVE' }
        : { status: { $nin: ['REGISTERING', 'DELETED'] } };
    const candidates = await collection
      .find({ tenant_id: ctx.tenant, ...visible }, { projection: { id: 1 } })
      .sort({ created_at: -1, id: 1 })
      .limit(1001)
      .toArray();
    if (candidates.length > 1000)
      throw new ServiceUnavailableException('CANDIDATE_WINDOW_TOO_LARGE');
    const allowed = await this.iam.batch(
      ctx,
      kind === 'tasks' ? 'IMAGE_TASK' : 'IMAGE_ASSET',
      candidates.map((r) => r.id),
      'view',
    );
    const ids = candidates.filter((_, i) => allowed[i]).map((r) => r.id);
    if (!ids.length) return { items: [], total: 0, models: [] };
    const rows = await collection
      .find({ tenant_id: ctx.tenant, id: { $in: ids }, ...visible })
      .toArray();
    if (kind === 'assets') {
      const tasks = await this.db
        .collection('image_tasks')
        .find({
          tenant_id: ctx.tenant,
          id: { $in: rows.map((r) => r.task_id) },
        })
        .toArray();
      const lookup = new Map(tasks.map((t) => [t.id, t]));
      for (const row of rows) {
        const task = lookup.get(row.task_id);
        row.prompt = task?.prompt || '';
        row.model = task?.model || '';
        row.settings = task?.settings;
        row.model_name = task?.model_name;
      }
    }
    const models = [...new Set(rows.map((r) => r.model))];
    const search = String(query.search || '').toLocaleLowerCase();
    let filtered = rows.filter(
      (r) =>
        (!search ||
          (r.prompt + ' ' + r.model).toLocaleLowerCase().includes(search)) &&
        (!query.model ||
          r.model === (query.model === '__unknown__' ? '' : query.model)),
    );
    filtered.sort(
      (a, b) =>
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) *
          (query.sort === 'oldest' ? 1 : -1) || a.id.localeCompare(b.id),
    );
    const total = filtered.length;
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const size = Math.min(
      100,
      Math.max(1, Math.floor(Number(query.pageSize) || 20)),
    );
    filtered = filtered.slice((page - 1) * size, page * size);
    return {
      items: filtered.map((r) => ({
        id: r.id,
        taskId: r.task_id || r.id,
        url:
          kind === 'assets'
            ? '/api/workbench/assets/' + r.id + '/preview'
            : undefined,
        code: '',
        prompt: r.prompt,
        settings: r.settings,
        modelName: r.model_name,
        createdAt: new Date(r.created_at).toISOString(),
        status: r.status,
      })),
      total,
      models,
    };
  }
  async bytes(ctx: IamContext, id: string, action: string) {
    const row = await this.asset(ctx, id, action);
    return { bytes: await this.storage.read(row as any), mime: row.mimeType };
  }
  async remove(ctx: IamContext, id: string) {
    await this.asset(ctx, id, 'delete');
    // Soft deletion preserves recoverability and leaves physical cleanup to retention policy.
    await this.db
      .collection('image_assets')
      .updateOne(
        { tenant_id: ctx.tenant, id },
        { $set: { status: 'DELETED', deleted_at: new Date() } },
      );
    return { deleted: true };
  }
}
