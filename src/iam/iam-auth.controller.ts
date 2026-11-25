import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IamAuth } from './iam-auth.service';
import { IamClient } from './iam-client.service';
@Controller('/api/auth')
export class IamAuthController {
  constructor(
    private readonly auth: IamAuth,
    private readonly iam: IamClient,
  ) {}
  @Get('/login') login(@Req() req: Request, @Res() res: Response) {
    return this.auth.login(res, req);
  }
  @Get('/callback') async callback(@Req() req: Request, @Res() res: Response) {
    if (this.auth.logoutCallback(req, res)) return;
    try {
      return await this.auth.callback(req, res);
    } catch (error) {
      if (error instanceof ForbiddenException)
        return res.redirect(
          this.auth.originFor(req) + '/#/login?access=denied',
        );
      throw error;
    }
  }
  @Get('/me') async me(@Req() req: Request) {
    const ctx = await this.auth.context(req);
    const account = await this.iam.invoke('/me/account', ctx.token);
    return {
      id: String(ctx.user),
      displayName: typeof account?.name === 'string' ? account.name.trim() : '',
      tenantId: ctx.tenant,
      tenantName: '租户 ' + ctx.tenant,
      permissions: ctx.permissions,
      csrfToken: ctx.csrf,
    };
  }
  @Post('/logout') logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.logout(req, res);
  }
}
