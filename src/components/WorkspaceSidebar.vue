<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Fold, Expand, Search } from '@element-plus/icons-vue'
import type { InputInstance } from 'element-plus'
import { filterMenus } from '../navigation/menus'

const storageKey = 'workspace-sidebar-collapsed'
function readCollapsed() {
  try {
    return localStorage.getItem(storageKey) === 'true'
  } catch {
    return false
  }
}
const narrow = ref(false)
const userCollapsed = ref(readCollapsed())
const narrowExpanded = ref(false)
const collapsed = computed(() => narrow.value ? !narrowExpanded.value : userCollapsed.value)
let narrowQuery: MediaQueryList | null = null
function syncViewport() {
  narrow.value = narrowQuery?.matches ?? false
  narrowExpanded.value = false
}
onMounted(() => {
  narrowQuery = window.matchMedia('(max-width: 900px)')
  syncViewport()
  narrowQuery.addEventListener('change', syncViewport)
})
onUnmounted(() => narrowQuery?.removeEventListener('change', syncViewport))
const query = ref('')
const input = ref<InputInstance>()
const route = useRoute()
const visibleMenus = computed(() => filterMenus(collapsed.value ? '' : query.value))

function setCollapsed(value: boolean) {
  query.value = ''
  if (narrow.value) { narrowExpanded.value = !value; return }
  userCollapsed.value = value
  try {
    localStorage.setItem(storageKey, String(value))
  } catch {
    // Storage may be unavailable; the sidebar still works for this session.
  }
}
async function openSearch() {
  setCollapsed(false)
  await nextTick()
  input.value?.focus()
}
</script>

<template>
  <aside class="workspace-sidebar" :class="{ collapsed }" aria-label="主导航">
    <div class="brand">
      <span class="brand-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.5 14.2 9.8 21.5 12 14.2 14.2 12 21.5 9.8 14.2 2.5 12 9.8 9.8Z" />
        </svg>
      </span>
      <span v-if="!collapsed" class="label">创作工作台</span>
    </div>
    <div class="menu-search">
      <el-tooltip v-if="collapsed" content="搜索菜单" placement="right">
        <button class="sidebar-row" type="button" aria-label="搜索菜单" @click="openSearch">
          <el-icon aria-hidden="true"><Search /></el-icon>
        </button>
      </el-tooltip>
      <el-input v-else ref="input" v-model="query" placeholder="搜索菜单" aria-label="搜索菜单" :prefix-icon="Search" clearable />
    </div>
    <nav class="menu-list" aria-label="工作区导航">
      <template v-for="(menu, index) in visibleMenus" :key="menu.routeName">
      <span v-if="!collapsed && menu.group && menu.group !== visibleMenus[index - 1]?.group" class="menu-group">{{ menu.group }}</span>
      <el-tooltip :content="menu.label" placement="right" :disabled="!collapsed">
        <router-link
          :to="{ name: menu.routeName }"
          class="sidebar-row"
          :class="{ selected: route.name === menu.routeName }"
          :aria-label="menu.label"
          :aria-current="route.name === menu.routeName ? 'page' : undefined"
        >
          <el-icon aria-hidden="true"><component :is="menu.icon" /></el-icon>
          <span v-if="!collapsed" class="label">{{ menu.label }}</span>
        </router-link>
      </el-tooltip>
      </template>
      <p v-if="!visibleMenus.length" class="no-results" role="status">未找到匹配菜单</p>
    </nav>
    <div class="sidebar-footer">
      <el-tooltip content="展开侧边栏" placement="right" :disabled="!collapsed">
        <button class="sidebar-row" type="button" :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'" :aria-expanded="!collapsed" @click="setCollapsed(!collapsed)">
          <el-icon aria-hidden="true"><Expand v-if="collapsed" /><Fold v-else /></el-icon>
          <span v-if="!collapsed" class="label">收起侧边栏</span>
        </button>
      </el-tooltip>
    </div>
  </aside>
</template>

<style scoped>
.menu-group { padding: 12px 14px 4px; color: var(--text-muted); font-size: 12px; }
.workspace-sidebar {
  --sidebar-accent: var(--brand);
  width: 176px;
  flex: 0 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: #fff;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
  letter-spacing: normal;
}

.workspace-sidebar.collapsed { width: 56px; }

.brand {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  color: var(--text-h);
  font-size: 14px;
  font-weight: 600;
}

.brand-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--brand);
}

.brand-icon svg { width: 20px; height: 20px; }
.label { white-space: nowrap; }
.menu-search { padding: 4px 10px 12px; }

.menu-search :deep(.el-input__wrapper) {
  min-height: 32px;
  padding: 0 10px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #fafbfe;
  box-shadow: 0 0 0 1px #e1e4ed inset;
  transition: box-shadow 200ms ease;
}

.menu-search :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px #c9cdda inset; }
.menu-search :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--sidebar-accent) inset; }
.menu-search :deep(.el-input__inner) { font-size: 13px; }
.menu-search :deep(.el-input__inner::placeholder),
.menu-search :deep(.el-input__prefix) { color: var(--text-muted); }
.menu-search :deep(.el-input__prefix-inner > .el-icon) { font-size: 16px; margin-right: 8px; }

.menu-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px;
}

.sidebar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  box-sizing: border-box;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  text-decoration: none;
  text-align: left;
  cursor: pointer;
  font: inherit;
  margin-bottom: 4px;
  transition: background-color 200ms, color 200ms;
}

.sidebar-row .el-icon { font-size: 18px; flex-shrink: 0; }
.sidebar-row:hover { background: #f7f7fd; }
.sidebar-row.selected { background: var(--brand-soft); color: var(--sidebar-accent); font-weight: 600; }
.sidebar-row:focus-visible { outline: 2px solid var(--sidebar-accent); outline-offset: -2px; }
.collapsed .brand { justify-content: center; padding: 0; }
.collapsed .menu-search { padding-right: 8px; padding-left: 8px; }
.collapsed .sidebar-row { justify-content: center; padding: 0; }

.sidebar-footer {
  flex-shrink: 0;
  padding: 10px 8px;
  border-top: 1px solid #eef0f5;
}

.sidebar-footer .sidebar-row { margin-bottom: 0; }
.no-results { padding: 12px 0; font-size: 13px; text-align: center; color: #777; }

@media (prefers-reduced-motion: reduce) {
  .workspace-sidebar, .sidebar-row, .menu-search :deep(.el-input__wrapper) { transition: none; }
}
</style>
