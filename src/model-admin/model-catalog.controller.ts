import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IamSessionGuard } from '../iam/iam-session.guard';
import { ImageAccess } from '../iam/image-access.service';
import type { IamContext } from '../iam/iam-client.service';
import { requireVideoPermission } from '../video/video.service';
import { GenerationModels } from './generation-models.service';

@Controller('/api/models')
@UseGuards(IamSessionGuard)
export class ModelCatalogController {
  constructor(
    private readonly models: GenerationModels,
    private readonly images: ImageAccess,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() req: { iam: IamContext }, @Query('kind') kind: unknown) {
    if (kind !== 'image' && kind !== 'video')
      throw new BadRequestException('INVALID_MODEL_KIND');
    if (kind === 'image') await this.images.requireCreate(req.iam);
    else requireVideoPermission(req.iam);
    return this.models.catalog(kind);
  }
}
