// Shared guards require their authentication and resource services to be exported.
import { ImageStorage } from './image-storage.service';
import { Global, Module } from '@nestjs/common';
import { IamDb } from './iam-db.service';
import { IamClient } from './iam-client.service';
import { IamAuth } from './iam-auth.service';
import { IamSessionGuard } from './iam-session.guard';
import { ImageAccess } from './image-access.service';
import { ImageGateway } from './image-gateway.interceptor';
import { IamAuthController } from './iam-auth.controller';
import { WorkbenchController } from './workbench.controller';
@Global()
@Module({
  controllers: [IamAuthController, WorkbenchController],
  providers: [
    IamDb,
    ImageStorage,
    IamClient,
    IamAuth,
    IamSessionGuard,
    ImageAccess,
    ImageGateway,
  ],
  exports: [IamDb, IamSessionGuard, ImageGateway, IamAuth, ImageAccess],
})
export class IamModule {}
