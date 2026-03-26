import { Body, Controller, Post } from '@nestjs/common';
import {
  JimengService,
  type FuseImagesRequest,
  type GenerateImageByImageRequest,
  type GenerateImageRequest,
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
}

