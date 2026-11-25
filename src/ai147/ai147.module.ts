import { Module } from '@nestjs/common';
import { Ai147Controller } from './ai147.controller';
import { Ai147Service } from './ai147.service';

@Module({
  controllers: [Ai147Controller],
  providers: [Ai147Service],
  exports: [Ai147Service],
})
export class Ai147Module {}
