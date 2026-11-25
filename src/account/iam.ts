import { shallowRef } from 'vue'
import { AccountError,installAccountAdapter } from './service.ts'
import { setAccountStorageScope } from './storage.ts'
export interface IamUser {id:string;displayName:string;tenantId:number;tenantName:string;permissions:string[];csrfToken:string}
export const iamUser=shallowRef<IamUser|null>(null)
export const hasPermission=(code:string)=>iamUser.value?.permissions.includes(code)===true
export async function loadIdentity(){let response:Response;try{response=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});}catch{throw new AccountError('network')}
 if(response.status===403){iamUser.value=null;throw new AccountError('forbidden')}if(response.status===401){iamUser.value=null;throw new AccountError('expired')}if(!response.ok)throw new AccountError('server');const user=await response.json() as IamUser;if(!user.id||!Array.isArray(user.permissions)||!user.csrfToken)throw new AccountError('server');sessionStorage.removeItem('nb.reauthenticate');setAccountStorageScope(user.tenantId,user.id);iamUser.value=user;return user}
export function installIamAccount(){
 let checking=false;
 const check=async()=>{if(checking||!iamUser.value||document.hidden)return;checking=true;try{await loadIdentity();}catch(error){if(error instanceof AccountError&&(error.code==='expired'||error.code==='forbidden'))window.location.replace('/#/login'+(error.code==='forbidden'?'?access=denied':''));}finally{checking=false;}};
 setInterval(()=>{void check()},15000);window.addEventListener('focus',()=>{void check()});
 installAccountAdapter({getMe:()=>loadIdentity(),getPasswordPolicy:async()=>{throw new AccountError('unavailable')},changePassword:async()=>{throw new AccountError('unavailable')},logout:async()=>{if(!iamUser.value)await loadIdentity();const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':iamUser.value!.csrfToken}});if(!response.ok)throw new AccountError('server');const result=await response.json();if(result.loggedOut!==true||!result.logoutUrl)throw new AccountError('server');sessionStorage.setItem('nb.reauthenticate','true');iamUser.value=null;window.location.assign(result.logoutUrl);return {redirected:true as const}},clearSession:async()=>{iamUser.value=null}})}
