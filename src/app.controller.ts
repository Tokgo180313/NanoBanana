import {
  Controller,
  Get,
  InternalServerErrorException,
  Post,
} from '@nestjs/common';
import { AppService } from './app.service';

@Controller("/api")
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("/hello")
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('/hello')
  postHello(): string {
    return this.appService.getHello();
  }

  @Get("/test")
  getTest(): string {
    return this.appService.getTest();
  }

  @Get('/ecs/zones')
  async getEcsZones() {
    try {
      const { ECSClient, DescribeZonesCommand } = await import(
        '@volcengine/ecs'
      );
      const client = new ECSClient({
        region: 'cn-north-1',
      });

      const command = new DescribeZonesCommand({});
      const response = await client.send(command);
      return response;
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Failed to call Volcengine ECS DescribeZones',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
