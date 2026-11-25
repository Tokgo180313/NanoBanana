<script setup lang="ts">
import { computed } from 'vue'
import type { VideoModel } from '../../api/generationModels'

const modelId = defineModel<string>('modelId', { required: true })
const resolution = defineModel<string>('resolution', { required: true })
const duration = defineModel<number>('duration', { required: true })
const ratio = defineModel<string>('ratio', { required: true })
const sound = defineModel<boolean>('sound', { required: true })
const props = defineProps<{
  models: VideoModel[]
  ratios: { label: string; width: number; height: number }[]
  frameMode: boolean
  ratioError: string
  loading: boolean
  failed: boolean
  submitting: boolean
  modelNotice: string
  parameterNotice: string
}>()
defineEmits<{ reload: []; modelChange: [] }>()

const capabilities = computed(() => props.models.find(model => model.id === modelId.value)?.capabilities)
const resolutions = computed(() => (capabilities.value?.resolutions ?? []).map(value => ({ label: value.toUpperCase(), value })))
const fixedDuration = computed(() => capabilities.value?.minDuration === capabilities.value?.maxDuration)
const durationScale = computed(() => {
  if (!capabilities.value || fixedDuration.value) return { marks: {}, ticks: [] }
  const { minDuration: min, maxDuration: max } = capabilities.value
  const span = max - min
  const labels = span > 2 ? [min, Math.round((min + max) / 2), max] : [min, max]
  const values = span <= 15 ? Array.from({ length: span + 1 }, (_, index) => min + index) : labels
  return {
    marks: Object.fromEntries(labels.map(value => [value, {
      label: String(value),
      style: value === duration.value ? { color: 'var(--duration-accent)' } : {},
    }])),
    ticks: values.map(value => ({
      value,
      position: ((value - min) / span) * 100 + '%',
      major: value === min || value === max,
    })),
  }
})
</script>

<template>
  <section class="generation-settings" aria-labelledby="video-settings-title">
    <h2 id="video-settings-title">生成设置</h2>
    <div class="field">
      <label for="video-model">视频模型</label>
      <el-select id="video-model" v-model="modelId" class="model-select" aria-label="视频模型"
        :placeholder="loading ? '正在加载模型…' : '请选择视频模型'"
        :loading="loading" :disabled="submitting || loading || !models.length"
        @change="$emit('modelChange')">
        <el-option v-for="model in models" :key="model.id" :label="model.name" :value="model.id" />
      </el-select>
      <p v-if="modelNotice" class="field-error" role="status">{{ modelNotice }}</p>
      <p v-if="parameterNotice" class="muted" role="status">{{ parameterNotice }}</p>
      <el-alert v-if="failed" title="视频模型读取失败" type="error" :closable="false"><el-button text @click="$emit('reload')">重试</el-button></el-alert>
      <el-alert v-else-if="!loading && !models.length" title="暂无可用视频模型" :closable="false" />
    </div>

    <div v-if="capabilities" class="field">
      <span class="field-label">视频分辨率</span>
      <el-segmented v-model="resolution" :options="resolutions" block aria-label="视频分辨率" />
    </div>

    <div v-if="capabilities" class="field duration-field">
      <span class="field-label">视频时长</span>
      <div class="duration-box" :class="{ 'has-scale': !fixedDuration }">
        <div class="duration-heading">
          <span>{{ fixedDuration ? '固定时长' : '拖动选择时长' }}</span>
          <output>{{ duration }}秒</output>
        </div>
        <div v-if="!fixedDuration" class="duration-scale">
          <div class="duration-ticks" aria-hidden="true">
            <span v-for="tick in durationScale.ticks" :key="tick.value"
              :class="{ major: tick.major, reached: tick.value <= duration }" :style="{ left: tick.position }" />
          </div>
          <el-slider v-model="duration" class="duration-slider" aria-label="视频时长" :min="capabilities.minDuration"
            :max="capabilities.maxDuration" :marks="durationScale.marks"
            :format-value-text="(value: number) => value + '秒'" :show-tooltip="false" />
        </div>
      </div>
    </div>

    <fieldset v-if="capabilities" class="ratio-field">
      <legend>视频比例</legend>
      <p v-if="frameMode && !ratioError" class="muted">跟随首帧</p>
      <div v-if="!frameMode" class="ratio-grid">
        <label v-for="option in ratios" :key="option.label" class="ratio-option" :class="{ selected: ratio === option.label }">
          <input v-model="ratio" type="radio" name="video-ratio" :value="option.label">
          <span class="ratio-shape" :class="{ adaptive: option.label === '自适应' }"
            :style="{ width: option.width + 'px', height: option.height + 'px' }" aria-hidden="true"></span>
          {{ option.label }}
        </label>
      </div>
      <p v-if="ratioError" class="field-error" role="alert">{{ ratioError }}</p>
    </fieldset>

    <div class="sound-row">
      <label for="video-sound">成片声音</label>
      <el-switch id="video-sound" v-model="sound" aria-label="成片声音" />
    </div>
  </section>
</template>

<style scoped>
.generation-settings { display: grid; gap: 10px; min-width: 0; padding-top: 12px; border-top: 1px solid var(--border); }
.generation-settings h2, .field-label, label, legend { font-size: 13px; font-weight: 600; }
.duration-field > .field-label { color: var(--text-muted); }
.duration-box {
  --duration-accent: #7136f5;
  --duration-fill: #a181ef;
  padding: 9px 10px;
  border: 1px solid #eae8ed;
  border-radius: 10px;
  background: #f5f4f7;
}
.duration-box.has-scale { padding-bottom: 8px; }
.duration-scale { position: relative; margin-inline: 7px; }
.duration-slider {
  --el-slider-height: 4px;
  --el-slider-border-radius: 0px;
  --el-slider-runway-bg-color: #dcd8e2;
  --el-slider-main-bg-color: var(--duration-fill);
  --el-slider-button-size: 14px;
  --el-slider-button-wrapper-size: 44px;
  --el-slider-button-wrapper-offset: -20px;
  height: 44px;
}
.duration-slider :deep(.el-slider__button) {
  border: 3px solid var(--surface);
  background: var(--duration-accent);
  box-shadow: 0 2px 7px #7136f547;
}
.duration-slider :deep(.el-slider__button-wrapper:focus-visible .el-slider__button) {
  outline: 2px solid var(--duration-accent);
  outline-offset: 2px;
}
.duration-slider :deep(.el-slider__marks-stop) { display: none; }
.duration-slider :deep(.el-slider__marks-text) {
  margin-top: 12px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.duration-ticks {
  position: absolute;
  inset: 15px 0 auto;
  pointer-events: none;
}
.duration-ticks span {
  position: absolute;
  width: 1px;
  height: 3px;
  background: #cfcbd7;
  transform: translateX(-50%);
}
.duration-ticks .major { height: 5px; background: #a49dad; }
.duration-ticks .reached { background: var(--duration-fill); }
.ratio-option { position: relative; }
.ratio-option input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.field { display: grid; gap: 6px; min-width: 0; }
.muted { color: var(--text-muted); font-size: 12px; }
.model-select { width: 100%; }
.field :deep(.el-segmented) { --el-segmented-bg-color: #f2f2f6; --el-segmented-item-selected-bg-color: var(--surface); --el-segmented-item-selected-color: var(--brand); }
.field-error { color: #a13636; font-size: 12px; }
.duration-heading, .sound-row { display: flex; justify-content: space-between; align-items: center; }
.duration-heading { color: var(--text-muted); font-size: 12px; font-weight: 600; }
.duration-heading output { color: var(--duration-accent); font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ratio-field { min-width: 0; padding: 0; margin: 0; border: 0; }
.ratio-field legend { margin-bottom: 6px; }
.ratio-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.ratio-option {
  display: grid;
  justify-items: center;
  grid-template-rows: 24px auto;
  align-items: center;
  gap: 3px;
  padding: 6px 2px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--canvas);
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
}
.ratio-option:focus-within { outline: 2px solid var(--brand); outline-offset: 2px; }
.ratio-option.selected { color: var(--brand); background: var(--brand-soft); border-color: var(--brand); }
.ratio-shape { border: 2px solid currentColor; border-radius: 3px; }
.ratio-shape.adaptive { border-style: dashed; }
.sound-row { border-top: 1px solid var(--border); padding-top: 6px; }
</style>
