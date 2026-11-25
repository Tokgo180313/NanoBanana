let namespace='nb-iam:unauthenticated:'
export function setAccountStorageScope(tenant:number|string,user:number|string){namespace=`nb-iam:${tenant}:${user}:`}
/** Draft/runtime data is local UX state. Server-owned task and asset records are authoritative. */
export const accountStorage={getItem:(key:string)=>localStorage.getItem(namespace+key),setItem:(key:string,value:string)=>localStorage.setItem(namespace+key,value),removeItem:(key:string)=>localStorage.removeItem(namespace+key)}
