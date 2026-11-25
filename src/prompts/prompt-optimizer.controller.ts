import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ImageAccess } from '../iam/image-access.service';
import type { IamContext } from '../iam/iam-client.service';
import { IamSessionGuard } from '../iam/iam-session.guard';
import { fields, required } from '../model-admin/model-admin.input';
import { requireVideoPermission } from '../video/video.service';
import { PromptOptimizer } from './prompt-optimizer.service';

@Controller('/api/prompts')
@UseGuards(IamSessionGuard)
export class PromptOptimizerController {
  constructor(
    private readonly optimizer: PromptOptimizer,
    private readonly images: ImageAccess,
  ) {}

  @Post('optimize')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async optimize(@Req() req: { iam: IamContext }, @Body() body: unknown) {
    const data = fields(body, ['prompt', 'kind', 'modelId']);
    const { kind } = data;
    if (kind !== 'image' && kind !== 'video')
      throw new BadRequestException('请选择图片或视频创作类型。');

    if (kind === 'image') await this.images.requireCreate(req.iam);
    else requireVideoPermission(req.iam);

    const limit = kind === 'image' ? 20_000 : 4_000;
    return this.optimizer.optimize(
      kind,
      required(data.modelId, 64, '创作模型'),
      required(data.prompt, limit, '提示词'),
      limit,
    );
  }
}
