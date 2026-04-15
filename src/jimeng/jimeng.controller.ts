import { Body, Controller, Post } from '@nestjs/common';
import {
  JimengService,
  type FuseImagesRequest,
  type GenerateImageByImageRequest,
  type GenerateImageRequest,
  type GenerateImage2Request,
  type QueryTaskResultRequest,
} from './jimeng.service';

@Controller('/api')
export class JimengController {
  constructor(private readonly jimengService: JimengService) {}

  @Post('/images/generate')
  async generateImage(
    @Body()
    body: GenerateImageRequest,
  ) {
    return this.jimengService.generateImage(body);
  }

  @Post('/images/generate-by-image')
  async generateImageByImage(
    @Body()
    body: GenerateImageByImageRequest,
  ) {
    return this.jimengService.generateImageByImage(body);
  }

  @Post('/images/fuse')
  async fuseImages(
    @Body()
    body: FuseImagesRequest,
  ) {
    return this.jimengService.fuseImages(body);
  }

  @Post('/images/task-result')
  async queryTaskResult(
    @Body()
    body: QueryTaskResultRequest,
  ) {
    return this.jimengService.queryTaskResult(body);
  }

  @Post('/image/generate2')
  async generateImage2(
    @Body()
    body: GenerateImage2Request,
  ) {
    return this.jimengService.generateImage2(body);
  }
}

