import { loadIdentity,hasPermission } from '../account/iam'
import { routePermissions } from '../navigation/menus'
import { AccountError } from '../account/service'
import { createRouter, createWebHashHistory } from 'vue-router'
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue'
import ImageGeneration from '../views/jimeng/index.vue'
import VideoGeneration from '../views/video/index.vue'
import LoginPage from '../views/login/index.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'Login', component: LoginPage },
    {
      path: '/',
      component: WorkspaceLayout,
      children: [
        { path: '', redirect: { name: 'ImageGeneration' } },
        { path: 'image-generation', name: 'ImageGeneration', component: ImageGeneration },
        { path: 'profile', name: 'UserProfile', component: () => import('../views/profile/index.vue') },
        { path: 'history', name: 'ImageHistory', component: () => import('../views/history/index.vue') },
        { path: 'model-access/providers', name: 'ProviderAdmin', component: () => import('../views/model-admin/Providers.vue') },
        { path: 'model-access/models', name: 'ModelAdmin', component: () => import('../views/model-admin/Models.vue') },
        { path: 'video-generation', name: 'VideoGeneration', component: VideoGeneration },
      ],
    },
  ],
})

router.beforeEach(async(to)=>{
 if(to.name==='Login')return true
 try{await loadIdentity()}catch(error){if(error instanceof AccountError&&error.code==='forbidden')return {name:'Login',query:{access:'denied'}};if(error instanceof AccountError&&error.code==='expired')return {name:'Login'};throw error}
 const required = routePermissions
 if(to.name&&required[String(to.name)]&&!hasPermission(required[String(to.name)]!)){if(hasPermission('image:task:list')&&to.name!=='ImageHistory')return {name:'ImageHistory'};return {name:'UserProfile'}}
 return true
})
