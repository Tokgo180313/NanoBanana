import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IamSessionGuard } from '../iam/iam-session.guard';
import type { IamContext } from '../iam/iam-client.service';
import { protocols } from './model-admin.input';
import { ModelAdminService } from './model-admin.service';

@Controller('/api/admin')
@UseGuards(IamSessionGuard)
export class ModelAdminController {
  constructor(
    private readonly admin: ModelAdminService,
    private readonly config: ConfigService,
  ) {}

  private authorize({ iam }: { iam: IamContext }, write = false) {
    if (
      this.config.get<string>('NB_MODEL_ADMIN_TENANT_ID') !==
        String(iam.tenant) ||
      !iam.permissions.includes('model:config:read') ||
      (write && !iam.permissions.includes('model:config:write'))
    )
      throw new ForbiddenException('无模型配置权限');
    return `${iam.tenant}:${iam.user}`;
  }

  @Get('model-adapters')
  adapters(@Req() req: { iam: IamContext }) {
    this.authorize(req);
    return protocols;
  }

  @Get('providers')
  @Header('Cache-Control', 'no-store')
  providers(@Req() req: { iam: IamContext }) {
    this.authorize(req);
    return this.admin.listProviders();
  }

  @Post('providers')
  createProvider(@Req() req: { iam: IamContext }, @Body() body: unknown) {
    return this.admin.saveProvider(this.authorize(req, true), body);
  }

  @Patch('providers/:id')
  updateProvider(
    @Req() req: { iam: IamContext },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.saveProvider(this.authorize(req, true), body, id);
  }

  @Get('models')
  models(@Req() req: { iam: IamContext }) {
    this.authorize(req);
    return this.admin.listModels();
  }

  @Post('models')
  createModel(@Req() req: { iam: IamContext }, @Body() body: unknown) {
    return this.admin.createModel(this.authorize(req, true), body);
  }

  @Patch('models/:id')
  updateModel(
    @Req() req: { iam: IamContext },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.updateModel(this.authorize(req, true), id, body);
  }

  @Get('model-config-changes')
  changes(
    @Req() req: { iam: IamContext },
    @Query() query: Record<string, unknown>,
  ) {
    this.authorize(req);
    return this.admin.listChanges(query);
  }
}
