import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { IamSessionGuard } from './iam-session.guard';
import { ImageAccess } from './image-access.service';
@Controller('/api/workbench')
@UseGuards(IamSessionGuard)
export class WorkbenchController {
  constructor(private readonly access: ImageAccess) {}
  @Get('/tasks') tasks(@Req() req: any, @Query() query: any) {
    return this.access.list(req.iam, 'tasks', query);
  }
  @Get('/assets') assets(@Req() req: any, @Query() query: any) {
    return this.access.list(req.iam, 'assets', query);
  }
  @Get('/tasks/:id') async task(@Req() req: any, @Param('id') id: string) {
    const row = await this.access.task(req.iam, id);
    return {
      id: row.id,
      status: row.status,
      model: row.model,
      modelId: row.model_id,
      prompt: row.prompt,
      createdAt: row.created_at,
    };
  }
  @Post('/tasks/:id/retry-registration') retryRegistration(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.access.retryRegistration(req.iam, id);
  }
  @Get('/assets/:id/preview') async preview(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const image = await this.access.bytes(req.iam, id, 'view');
    res
      .set({
        'Content-Type': image.mime,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image.bytes);
  }
  @Get('/assets/:id/download') async download(
    @Req() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const image = await this.access.bytes(req.iam, id, 'download');
    res
      .set({
        'Content-Type': image.mime,
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="image.${image.mime === 'image/jpeg' ? 'jpg' : image.mime.split('/')[1]}"`,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image.bytes);
  }
  @Delete('/assets/:id') remove(@Req() req: any, @Param('id') id: string) {
    return this.access.remove(req.iam, id);
  }
}
