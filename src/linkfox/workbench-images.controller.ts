import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Ai147Service,
  type Ai147GenerateRequest,
} from '../ai147/ai147.service';
import { IamSessionGuard } from '../iam/iam-session.guard';
import { ImageGateway, imageAdapter } from '../iam/image-gateway.interceptor';
import { LinkfoxService, type LinkfoxGenerateRequest } from './linkfox.service';

@Controller('/api/workbench/images')
@UseGuards(IamSessionGuard)
@UseInterceptors(ImageGateway)
export class WorkbenchImagesController {
  constructor(
    private readonly linkfox: LinkfoxService,
    private readonly ai147: Ai147Service,
  ) {}

  @Post('generate')
  async generate(
    @Body()
    body: LinkfoxGenerateRequest &
      Ai147GenerateRequest & { [imageAdapter]: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (body[imageAdapter] === 'linkfox') return this.linkfox.generate(body);
    const abort = new AbortController();
    const close = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.once('close', close);
    try {
      return await this.ai147.generate(body, abort.signal);
    } finally {
      response.off('close', close);
    }
  }
}
