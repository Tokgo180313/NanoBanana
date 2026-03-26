<template>
  <el-popover placement="left" title="历史记录" trigger="click" :width="popoverWidth">
    <div class="history-list-wrap">
      <div v-for="image in historyImageList" :key="image.uid" class="history-item">
        <el-image
          class="history-img"
          :src="resolveImageSrc(image.url, image.code)"
          fit="cover"
          :preview-src-list="[resolveImageSrc(image.url, image.code)]"
        />
        <div class="history-content">
          <div class="history-prompt" :title="image.context || ''">
            {{ image.context || "（无文案）" }}
          </div>
          <div class="history-actions">
            <el-button size="small" type="primary" link @click="emit('view', image)">
              查看
            </el-button>
            <el-button size="small" type="primary" link @click="emit('download', image)">
              下载
            </el-button>
            <el-button size="small" type="danger" link @click="emit('delete', image)">
              删除
            </el-button>
          </div>
        </div>
      </div>
    </div>
    <template #reference>
      <div
        class="output-history-btn"
        :class="historyImageList.length ? '' : 'disabled-history'"
      >
        历史记录
      </div>
    </template>
  </el-popover>
</template>

<script setup lang="ts">
type HistoryImage = {
  uid: string
  url: string
  code: string
  context: string
}

defineProps<{
  historyImageList: HistoryImage[]
  resolveImageSrc: (urlOrBase64: string, code: string) => string
  popoverWidth: number
}>()

const emit = defineEmits<{
  (e: "view", image: HistoryImage): void
  (e: "download", image: HistoryImage): void
  (e: "delete", image: HistoryImage): void
}>()
</script>

<style scoped>
.output-history-btn {
  cursor: pointer;
  text-align: center;
  border: 1px solid #4f46e5;
  border-radius: 5px;
  margin: 0.5em 0;
  line-height: 32px;
  height: 32px;
  user-select: none;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.history-list-wrap {
  width: 100%;
}

.history-img {
  width: 64px;
  height: 48px;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
}

:deep(.history-img .el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.history-actions {
  display: flex;
  gap: 8px;
}

.history-content {
  flex: 1;
  min-width: 0;
}

.history-prompt {
  font-size: 12px;
  color: #606266;
  line-height: 1.4;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
  white-space: normal;
}

.disabled-history {
  opacity: 0.55;
  pointer-events: none;
}
</style>
