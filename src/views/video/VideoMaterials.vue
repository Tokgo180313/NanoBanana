<script setup lang="ts">
import { computed, onDeactivated, ref } from 'vue'
import { ArrowRight, Close, Picture, Plus, Upload } from '@element-plus/icons-vue'
import { audioExtensions, frames, imageExtensions, limits, materialModes, type VideoMaterialsState } from './useVideoMaterials'

const mode = defineModel<string>({ required: true })
const { materials } = defineProps<{ materials: VideoMaterialsState }>()
const { references, frameFiles, materialError, uploadSizeError, selectionError,
  addReferences, clearReferences, removeReference, selectFrame, removeFrame } = materials

const imageInput = ref<HTMLInputElement>()
const audioInput = ref<HTMLInputElement>()
const previewUrl = ref<string>()
const images = computed(() => references.value.filter(item => item.kind === 'image'))
const audio = computed(() => references.value.filter(item => item.kind === 'audio'))
const imageUrls = computed(() => mode.value === '首尾帧'
  ? frames.flatMap(frame => frameFiles[frame]?.url ?? [])
  : images.value.map(image => image.url))
const previewIndex = computed(() => imageUrls.value.indexOf(previewUrl.value ?? ''))

function changeMode(value: string) {
  mode.value = value
  selectionError.value = ''
  previewUrl.value = undefined
}

onDeactivated(() => { previewUrl.value = undefined })
</script>

<template>
  <section class="materials" aria-labelledby="video-materials-title">
    <div class="section-heading">
      <h2 id="video-materials-title">素材</h2>
      <el-popover trigger="click" placement="bottom-end" :width="248">
        <div class="rules">
          <p>参考图最多 {{ limits.image }} 张，每张小于 30 MB。支持 JPG、PNG、WebP、GIF、BMP、TIFF 和 HEIC/HEIF。</p>
          <p>参考音频最多 {{ limits.audio }} 段，每段不超过 15 MB，支持 MP3 和 WAV。每次提交的素材合计不超过 47 MB。</p>
          <p>首尾帧模式需上传首帧，尾帧选填。</p>
        </div>
        <template #reference>
          <button type="button" class="rules-button">素材规则<el-icon><ArrowRight /></el-icon></button>
        </template>
      </el-popover>
    </div>
    <el-segmented class="mode-switch" :model-value="mode" :options="materialModes" block aria-label="素材模式" @change="changeMode" />

    <div class="source-area">
      <template v-if="mode === '参考图'">
        <input ref="imageInput" type="file" :accept="imageExtensions" multiple hidden @change="addReferences($event, 'image')">
        <input ref="audioInput" type="file" :accept="audioExtensions" multiple hidden @change="addReferences($event, 'audio')">
        <button v-if="!images.length" class="upload-tile" type="button" @click="imageInput?.click()">
          <el-icon class="upload-icon" :size="22"><Picture /></el-icon>
          <strong>上传参考图</strong>
          <small>最多 {{ limits.image }} 张 · 单张小于 30 MB</small>
        </button>
        <template v-else>
          <ul class="reference-grid" aria-label="已选参考图">
            <li v-for="image in images" :key="image.id" class="thumbnail">
              <button class="thumbnail-preview" type="button" :aria-label="'预览 ' + image.file.name" @click="previewUrl = image.url">
                <img :src="image.url" alt="">
              </button>
              <button class="remove-file" type="button" :aria-label="'删除 ' + image.file.name" @click="removeReference(image.id)">
                <el-icon><Close /></el-icon>
              </button>
            </li>
          </ul>
          <div class="asset-toolbar">
            <el-button class="add-images" type="primary" :icon="Upload" :disabled="images.length >= limits.image" @click="imageInput?.click()">
              {{ images.length >= limits.image ? '已达上限' : '继续上传' }}
            </el-button>
            <el-button plain @click="clearReferences('image')">清空图片</el-button>
            <span class="asset-count" aria-live="polite">{{ images.length }}/{{ limits.image }}</span>
          </div>
        </template>

        <div class="audio-area">
          <el-button text type="primary" :icon="Plus" :disabled="audio.length >= limits.audio" @click="audioInput?.click()">添加参考音频</el-button>
          <span class="asset-count" aria-live="polite">{{ audio.length }}/{{ limits.audio }}</span>
        </div>
        <ul v-if="audio.length" class="audio-list" aria-label="已选参考音频">
          <li v-for="item in audio" :key="item.id">
            <div class="audio-preview">
              <span :title="item.file.name">{{ item.file.name }}</span>
              <audio controls preload="none" :src="item.url" :aria-label="'试听 ' + item.file.name" />
            </div>
            <button class="remove-file" type="button" :aria-label="'删除 ' + item.file.name" @click="removeReference(item.id)">
              <el-icon><Close /></el-icon>
            </button>
          </li>
        </ul>
      </template>

      <div v-else class="frame-grid">
        <div v-for="frame in frames" :key="frame" class="frame-slot">
          <p class="frame-label"><strong>{{ frame }}</strong><small>{{ frame === '首帧' ? '必选' : '选填' }}</small></p>
          <div v-if="frameFiles[frame]" class="thumbnail">
            <button class="thumbnail-preview" type="button" :aria-label="'预览' + frame" @click="previewUrl = frameFiles[frame]?.url">
              <img :src="frameFiles[frame]?.url" alt="">
            </button>
            <button class="remove-file" type="button" :aria-label="'删除' + frame" @click="removeFrame(frame)">
              <el-icon><Close /></el-icon>
            </button>
          </div>
          <label class="frame-picker" :class="frameFiles[frame] ? 'replace-frame' : 'upload-tile'">
            <input class="frame-input" type="file" :accept="imageExtensions" :aria-label="(frameFiles[frame] ? '更换' : '上传') + frame" @change="selectFrame(frame, $event)">
            <el-icon v-if="!frameFiles[frame]" :size="18"><Plus /></el-icon>
            {{ (frameFiles[frame] ? '更换' : '上传') + frame }}
          </label>
        </div>
      </div>
    </div>
    <p v-if="selectionError || materialError || uploadSizeError" class="field-error" role="alert">
      <span v-if="selectionError">{{ selectionError }}</span>
      <span v-if="materialError">{{ materialError }}</span>
      <span v-if="uploadSizeError">{{ uploadSizeError }}</span>
    </p>
    <el-image-viewer v-if="previewIndex >= 0" :url-list="imageUrls" :initial-index="previewIndex" teleported @close="previewUrl = undefined" />
  </section>
</template>

<style scoped>
.materials { min-width: 0; }
.section-heading, .audio-area { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.section-heading { margin-bottom: 7px; }
.section-heading h2, .frame-label strong { font-size: 13px; }
.rules-button { display: inline-flex; align-items: center; gap: 3px; padding: 5px 0; border: 0; color: var(--brand); background: none; cursor: pointer; }
.rules { display: grid; gap: 6px; overflow-wrap: anywhere; }
.mode-switch { --el-segmented-bg-color: #f2f2f6; --el-segmented-item-selected-bg-color: var(--surface); --el-segmented-item-selected-color: var(--brand); }
.source-area { margin-top: 8px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: #fcfbfe; }
.upload-tile { display: grid; place-content: center; justify-items: center; gap: 4px; width: 100%; min-height: 100px; padding: 7px; border: 1px dashed var(--brand-border); border-radius: 7px; color: var(--text); background: var(--surface); cursor: pointer; text-align: center; }
.upload-tile:hover { border-color: var(--brand); }
.upload-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 8px; color: var(--brand); background: var(--brand-soft); }
.upload-tile small, .asset-count, .frame-label small { color: var(--text-muted); font-size: 11px; }
.reference-grid, .frame-grid { display: grid; gap: 6px; }
.reference-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; padding: 0; margin: 0; }
.frame-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.frame-slot { display: grid; align-content: start; gap: 5px; min-width: 0; }
.frame-label { display: flex; align-items: center; gap: 5px; }
.frame-picker, .thumbnail { position: relative; min-width: 0; }
.frame-picker.upload-tile { min-height: 0; aspect-ratio: 1; }
.frame-input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.frame-picker:focus-within { outline: 2px solid var(--brand); outline-offset: 2px; }
.replace-frame { padding: 4px; border: 1px solid var(--brand-border); border-radius: 5px; color: var(--brand); background: var(--brand-soft); text-align: center; cursor: pointer; }
.thumbnail-preview { display: block; width: 100%; aspect-ratio: 1; padding: 0; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--surface); cursor: zoom-in; }
.thumbnail-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
.remove-file { display: grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px; padding: 0; border: 1px solid var(--border); border-radius: 5px; color: var(--text); background: var(--surface); cursor: pointer; }
.thumbnail .remove-file { position: absolute; top: 4px; right: 4px; }
.asset-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.asset-toolbar .el-button + .el-button { margin-left: 0; }
.add-images { flex: 1; }
.audio-area { margin-top: 5px; }
.audio-area .el-button { padding-inline: 4px; }
.audio-list { display: grid; gap: 6px; list-style: none; padding: 0; margin: 0; }
.audio-list li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.audio-preview { flex: 1; min-width: 0; font-size: 12px; }
.audio-preview span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audio-preview audio { display: block; width: 100%; height: 36px; }
.field-error { display: grid; gap: 3px; margin-top: 6px; color: var(--el-color-danger); font-size: 12px; overflow-wrap: anywhere; }
</style>
