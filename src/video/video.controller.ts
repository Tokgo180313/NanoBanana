import {
  Body,
  type CanActivate,
  Controller,
  DefaultValuePipe,
  type ExecutionContext,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { IamSessionGuard } from '../iam/iam-session.guard';
import type { IamContext } from '../iam/iam-client.service';
import {
  MAX_IMAGE_BYTES,
  parseVideoInput,
  videoUploadStorage,
  type VideoFiles,
} from './video-input';
import { requireVideoPermission, VideoService } from './video.service';

type VideoRequest = Request & { iam: IamContext };

class VideoPermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    requireVideoPermission(
      context.switchToHttp().getRequest<VideoRequest>().iam,
    );
    return true;
  }
}

@Controller('/api/videos/tasks')
@UseGuards(IamSessionGuard, VideoPermissionGuard)
export class VideoController {
  constructor(private readonly video: VideoService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'images', maxCount: 9 },
        { name: 'audio', maxCount: 3 },
        { name: 'firstFrame', maxCount: 1 },
        { name: 'lastFrame', maxCount: 1 },
      ],
      {
        storage: videoUploadStorage,
        limits: {
          files: 12,
          fileSize: MAX_IMAGE_BYTES + 1,
          fields: 6,
          fieldSize: 16_000,
          parts: 19,
        },
      },
    ),
  )
  create(
    @Req() req: VideoRequest,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: VideoFiles,
  ) {
    return this.video.create(req.iam, parseVideoInput(body, files));
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Req() req: VideoRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.video.list(req.iam, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() req: VideoRequest, @Param('id') id: string) {
    return this.video.detail(req.iam, id);
  }

  @Get(':id/download')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Req() req: VideoRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const abort = new AbortController();
    res.once('close', () => abort.abort());
    const body = await this.video.download(req.iam, id, abort.signal);
    return new StreamableFile(
      Readable.fromWeb(body as unknown as NodeReadableStream),
      {
        type: 'video/mp4',
        disposition: 'attachment; filename="generated-video.mp4"',
      },
    );
  }
}
