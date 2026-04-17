import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  LinkfoxService,
  type LinkfoxGenerateRequest,
  type LinkfoxGetImageRequest,
  type LinkfoxUploadByBase64Request,
} from './linkfox.service';

@Controller('/api/linkfox')
export class LinkfoxController {
  constructor(private readonly linkfoxService: LinkfoxService) {}

  @Get('/status')
  getStatus() {
    return this.linkfoxService.getStatus();
  }

  @Post('/generate')
  async generate(
    @Body()
    body: LinkfoxGenerateRequest,
  ) {
    return this.linkfoxService.generate(body);
  }

  @Post('/getImage')
  async getImage(
    @Body()
    body: LinkfoxGetImageRequest,
  ) {
    return this.linkfoxService.getImage(body);
  }

  @Post('/uploadByBase64')
  async uploadByBase64(
    @Body()
    body: LinkfoxUploadByBase64Request,
  ) {
    return this.linkfoxService.uploadByBase64(body);
  }
}
