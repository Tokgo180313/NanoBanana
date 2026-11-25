<script setup lang="ts">
import { onMounted, provide, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import UserMenu from '../components/UserMenu.vue'
import ChangePasswordDialog from '../components/ChangePasswordDialog.vue'
import { useAccountStore } from '../stores/accountStore'
import { openPasswordDialogKey } from '../account/context'
import { useImageHistoryStore } from '../stores/imageHistoryStore.ts'
import WorkspaceSidebar from '../components/WorkspaceSidebar.vue'
const history = useImageHistoryStore()
const account = useAccountStore()
const router = useRouter()
const passwordOpen = ref(false)
provide(openPasswordDialogKey, () => { passwordOpen.value = true })
onMounted(async () => {
  await account.load()
  if (account.sessionExpired) await router.replace({ name: 'Login' })
})
watch(() => account.sessionExpired, expired => {
  if (expired) { passwordOpen.value = false; void router.replace({ name: 'Login' }) }
})
onMounted(() => { void history.initialize() })
</script>

<template>
  <div class="workspace-layout">
    <WorkspaceSidebar />
    <div class="workspace-body">
      <header class="workspace-header"><span class="workspace-caption">创作空间</span><UserMenu @change-password="passwordOpen = true" /></header>
      <main class="workspace-main" aria-label="创作内容">
        <router-view v-slot="{ Component }">
          <!-- Keep component-local uploads, refs and running requests alive across navigation. -->
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </main>
    </div>
    <ChangePasswordDialog v-model="passwordOpen" />
  </div>
</template>

<style scoped>
.workspace-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  min-width: 0;
  text-align: left;
  color-scheme: light;
  color: var(--text);
  background: var(--canvas);
}
.workspace-body { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.workspace-header { min-height: 60px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 8px 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
.workspace-caption { font-size: 12px; color: var(--text-muted); }
.workspace-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  container-type: inline-size;
  container-name: workspace;
}
</style>
