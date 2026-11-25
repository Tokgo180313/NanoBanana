import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { IamSessionGuard } from '../iam/iam-session.guard';
import { ImageGateway } from '../iam/image-gateway.interceptor';
import { Ai147Service, type Ai147GenerateRequest } from './ai147.service';

@Controller('/api/ai147')
@UseGuards(IamSessionGuard)
@UseInterceptors(ImageGateway)
export class Ai147Controller {
  constructor(private readonly service: Ai147Service) {}

  @Post('/generate')
  async generate(
    @Body() body: Ai147GenerateRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const abort = new AbortController();
    const close = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.once('close', close);
    try {
      return await this.service.generate(body, abort.signal);
    } finally {
      response.off('close', close);
    }
  }
}
