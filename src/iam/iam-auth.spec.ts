import {ConfigService} from '@nestjs/config';
import {ForbiddenException} from '@nestjs/common';
import {IamAuth,sessionCookie} from './iam-auth.service';
import {createHash} from 'node:crypto';
describe('application admission for existing image sessions',()=>{
 const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 function setup(allowed:boolean){
  const collection={findOne:jest.fn().mockResolvedValue({token_cipher:'encrypted',csrf_token:'csrf'}),deleteOne:jest.fn().mockResolvedValue({deletedCount:1})};
  const db={collection:jest.fn().mockReturnValue(collection)};
  const iam={invoke:jest.fn(async(path:string)=>{if(path.includes('application-access')){if(!allowed)throw new ForbiddenException('APPLICATION_ACCESS_DENIED');return {allowed:true};}if(path==='/me')return {tenantId:1,userId:5};return ['image:task:create'];})};
  const auth=new IamAuth(new ConfigService({OIDC_JWKS:'http://localhost:8180/realms/nexus/protocol/openid-connect/certs'}),db as any,iam as any);
  jest.spyOn(auth,'open').mockReturnValue('token');jest.spyOn(auth,'verifyAccess').mockResolvedValue({sub:'test-user'});
  return {auth,collection,iam};
 }
 it('keeps an explicitly admitted application session',async()=>{const {auth,collection,iam}=setup(true);const ctx=await auth.context({headers:{cookie:sessionCookie+'=opaque-test'}} as any);expect(ctx.user).toBe(5);expect(iam.invoke).toHaveBeenCalledWith('/me/application-access?appCode=image-workbench','token');expect(collection.deleteOne).not.toHaveBeenCalled();});
 it('deletes an existing session when application access is revoked',async()=>{const {auth,collection}=setup(false);await expect(auth.context({headers:{cookie:sessionCookie+'=opaque-test'}} as any)).rejects.toThrow(ForbiddenException);expect(collection.deleteOne).toHaveBeenCalledWith({id_hash:hash('opaque-test')});});
});
