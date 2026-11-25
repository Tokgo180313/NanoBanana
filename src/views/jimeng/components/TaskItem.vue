<template>
  <article class="task-card" :aria-labelledby="`task-title-${taskId}`">
    <header class="task-header">
      <div class="task-heading">
        <h2 :id="`task-title-${taskId}`" class="task-title" :title="generatedTaskId ? `生成编号：${generatedTaskId}` : undefined">任务 {{ String(taskNumber).padStart(2, '0') }}</h2>
        <span class="task-status" :class="`status-${showStatus}`" role="status" aria-live="polite">{{ showStatus === '0' ? '未开始' : showStatus === '1' ? '生成中' : showStatus === '2' ? '已完成' : '失败' }}</span>
      </div>
      <div class="task-actions">
        <el-tooltip content="复制任务" placement="top"><el-button class="icon-action" :icon="CopyDocument" aria-label="复制任务" :disabled="pendingUploads > 0" @click="emit('duplicate')" /></el-tooltip>
        <el-tooltip content="删除任务" placement="top"><el-button class="icon-action delete-action" :icon="Delete" aria-label="删除任务" :disabled="isBusy()" @click="emit('remove')" /></el-tooltip>
      </div>
    </header>
    <div class="task-body">
      <div class="task-config">
        <div class="config-field model-config">
          <label :for="`task-model-${taskId}`">模型</label>
          <el-select :id="`task-model-${taskId}`" v-model="visibleSettings.modelName" aria-label="任务模型" :disabled="isBusy() || !models.length">
            <el-option v-for="item in modelOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div class="config-field">
          <label :for="`task-ratio-${taskId}`">比例</label>
          <el-select :id="`task-ratio-${taskId}`" v-model="visibleSettings.imageRatio" aria-label="任务比例" :disabled="isBusy() || !selectedModel">
            <el-option v-for="item in showRationOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div v-if="!isBasicBanana" class="config-field">
          <label :for="`task-size-${taskId}`">分辨率</label>
          <el-select :id="`task-size-${taskId}`" v-model="visibleSettings.imageSize" aria-label="任务分辨率" :disabled="isBusy() || showSizeOptions.length <= 1">
            <el-option v-for="item in showSizeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
      </div>
      <div class="task-workspace">
        <section class="input-content" aria-label="创作输入">
          <div class="field-heading"><span>参考图 <span class="field-note">{{ requiresReference ? '必填' : '选填' }} · 最多 {{ Math.min(4, selectedModel?.capabilities.maxReferenceImages ?? 4) }} 张</span></span>
            <el-tooltip content="支持点击或拖入 JPG、PNG；上传后自动压缩为 JPEG。" placement="top"><el-icon class="help-icon" aria-label="参考图格式说明" tabindex="0"><InfoFilled /></el-icon></el-tooltip>
          </div>
          <div class="upload-grid" :class="{ 'inputs-locked': isBusy() }" :inert="isBusy()">
            <div
              v-for="(slotFiles, slotIndex) in uploadSlots"
              :key="`upload-slot-${slotIndex}`"
              class="upload-area"
              :class="{ 'is-dragging': draggingSlot === slotIndex }"
              @dragover.prevent="draggingSlot = slotIndex"
              @dragleave.prevent="
                draggingSlot = draggingSlot === slotIndex ? null : draggingSlot
              "
              @drop.prevent="onUploadDrop(slotIndex, $event)"
            >
              <el-upload
                v-if="slotFiles.length === 0"
                list-type="picture-card"
                :limit="1"
                :auto-upload="false"
                :show-file-list="false"
                :disabled="isBusy()"
                :aria-label="`上传第 ${slotIndex + 1} 张参考图`"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                :multiple="false"
                :file-list="slotFiles"
                :on-preview="handlePictureCardPreview"
                :on-remove="getRemoveHandler(slotIndex)"
                :on-change="getChangeHandler(slotIndex)"
                class="picture-wall"
              >
                <template #default>
                  <div class="upload-plus">
                    <el-icon class="upload-plus-inner" aria-hidden="true"><Plus /></el-icon>
                    <span class="sr-only">选择第 {{ slotIndex + 1 }} 张参考图</span>
                  </div>
                </template>
              </el-upload>

              <div v-else class="uploaded-thumb-wrap">
                <el-image
                  :alt="`参考图 ${slotIndex + 1}`"
                  class="uploaded-thumb"
                  :src="slotFiles[0]?.url || ''"
                  fit="cover"
                  :preview-src-list="[slotFiles[0]?.url || '']"
                  preview-teleported
                />
                <button
                  class="uploaded-delete-btn"
                  type="button"
                  title="删除图片"
                  :aria-label="`删除第 ${slotIndex + 1} 张参考图`"
                  :disabled="isBusy()"
                  @click.stop="clearUploadSlot(slotIndex)"
                >
                  <el-icon aria-hidden="true"><Close /></el-icon>
                </button>
              </div>
            </div>
          </div>


          <p class="field-help" role="status">{{ pendingUploads ? '正在处理参考图…' : '' }}</p>
          <p v-if="referenceError" class="field-error" role="alert">{{ referenceError }}</p>
          <div class="text-content">
            <label class="field-heading" :for="`task-prompt-${taskId}`">提示词</label>
            <div class="prompt-box">
              <el-input class="prompt-inline-input" type="textarea" v-model="currentText" :id="`task-prompt-${taskId}`" :rows="8" resize="vertical"
                :maxlength="IMAGE_PROMPT_LIMIT" :disabled="isBusy()" :aria-invalid="!!promptError"
                :aria-describedby="promptError ? `task-prompt-error-${taskId}` : undefined"
                placeholder="保留参考图中的产品，浅色背景，自然光，主体居中…" />
              <div class="prompt-toolbar">
                <div class="prompt-actions">
                  <el-button :icon="Delete" title="清空提示词" aria-label="清空提示词"
                    :disabled="isBusy() || !currentText" @click="clearTextBtn" />
                  <el-button :icon="FullScreen" title="展开编辑" aria-label="展开编辑"
                    aria-haspopup="dialog" @click="promptEditorOpen = true" />
                </div>
                <PromptOptimizer compact kind="image" :prompt="currentText" :model-id="selectedModel?.id"
                  :disabled="isBusy()" @apply="currentText = $event" />
                <span class="prompt-count" :class="{ 'prompt-count-over': promptLength > IMAGE_PROMPT_LIMIT }">
                  {{ promptLength }} / {{ IMAGE_PROMPT_LIMIT }}
                </span>
              </div>
            </div>
            <p v-if="promptError" :id="`task-prompt-error-${taskId}`" class="field-error" role="alert">{{ promptError }}</p>
          </div>
          <div class="generation-actions">
            <el-button class="generate-button" type="primary" :icon="MagicStick" :loading="isBusy()" :disabled="isBusy() || pendingUploads > 0 || !selectedModel" @click="submitBtn2">{{ isBusy() ? '生成中' : showStatus === '3' ? '重试生成' : '开始生成' }}</el-button>
            <el-button v-if="responseLoading" :aria-describedby="`task-stop-help-${taskId}`" @click="cancelBtn">停止等待</el-button>
          </div>
        </section>
        <section class="output-content" aria-label="生成结果">
          <div class="field-heading"><span>生成预览</span><span v-if="!responseLoading && !generationError" class="field-note">{{ currentUrl ? '点击图片放大' : '等待生成' }}</span></div>
          <div class="output-image" :class="{ 'has-result': currentUrl }" :aria-busy="responseLoading">
            <el-image v-if="currentUrl" :src="resolveImageSrc(currentUrl, currentUrlCode)" alt="本任务生成结果" class="result-img" fit="contain" :preview-src-list="[resolveImageSrc(currentUrl, currentUrlCode)]" preview-teleported />
            <div v-else-if="!responseLoading && !generationError" class="preview-empty"><el-icon aria-hidden="true"><Picture /></el-icon><span>生成结果将展示在这里</span></div>
            <div v-if="responseLoading" class="preview-state preview-loading">
              <div class="spinner" aria-hidden="true" />
              <span>正在生成图片…</span>
              <p :id="`task-stop-help-${taskId}`" class="preview-help">停止等待不会保证取消服务端任务。</p>
            </div>
            <div v-else-if="generationError" class="preview-state preview-error" role="region" aria-label="生成失败详情" tabindex="0">
              <strong>生成失败</strong>
              <p role="alert">{{ generationError }}</p>
            </div>
          </div>
          <div class="result-actions">
            <el-button :icon="Download" :disabled="!hasPermission('image:asset:download') || !currentUrl || downloading" :loading="downloading" @click="downloadWithFeedback">下载结果</el-button>
            <HistoryImageItem :history-image-list="historyImageList" :resolve-image-src="resolveImageSrc" :popover-width="historyPopoverWidth" :busy="isBusy()" @reuse="reuseHistoryEvent" @view="viewHistoryEvent" @download="downloadHistoryEvent" @delete="deleteHistoryEvent" />
            <a v-if="currentUrl && isHttpUrl(currentUrl)" class="result-link" :href="currentUrl" target="_blank" rel="noopener noreferrer" aria-label="打开原图"><el-icon><TopRight /></el-icon></a>
          </div>
        </section>
      </div>
    </div>
    <el-dialog v-model="promptEditorOpen" :title="`任务 ${String(taskNumber).padStart(2, '0')} · 编辑提示词`" class="prompt-editor-dialog" width="min(960px, calc(100vw - 32px))" top="5vh" append-to-body :close-on-click-modal="false" @opened="expandedPromptInput?.focus()">
      <template #header="{ titleId }">
        <div class="prompt-editor-heading"><h2 :id="titleId">任务 {{ String(taskNumber).padStart(2, '0') }} · 编辑提示词</h2><p>{{ isBusy() ? '任务生成中，当前提示词为只读状态' : '支持分段编写，编辑内容实时同步到任务卡' }}</p></div>
      </template>
      <el-input ref="expandedPromptInput" v-model="currentText" type="textarea" class="prompt-expanded-input" aria-label="完整提示词" :maxlength="IMAGE_PROMPT_LIMIT" :readonly="isBusy()" resize="none" placeholder="可分段描述主体、构图、场景、材质、灯光，以及需要保留或避免的细节…" />
      <template #footer>
        <div class="prompt-editor-footer"><span>{{ promptLength }} / {{ IMAGE_PROMPT_LIMIT }} 字符 · {{ promptLines.toLocaleString() }} 行</span><el-button type="primary" @click="promptEditorOpen = false">完成编辑</el-button></div>
      </template>
    </el-dialog>
    <el-image v-if="previewSrcList.length" ref="previewImageRef" :src="previewSrcList[previewInitialIndex] || ''" :preview-src-list="previewSrcList" :initial-index="previewInitialIndex" preview-teleported class="preview-bridge-image" aria-hidden="true" />
  </article>
</template>

<script setup lang="ts">
import { hasPermission } from '../../../account/iam'
import { accountStorage } from '../../../account/storage.ts'

import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type UploadFile, type InputInstance } from "element-plus";
import imageCompression from "browser-image-compression";
import { isAxiosError } from "axios";
import moment from "moment";
import { CopyDocument, Delete, Plus, Close, InfoFilled, MagicStick, Picture, Download, TopRight, FullScreen } from "@element-plus/icons-vue";
import { linxfoxUploadByBase64Api, linkfoxGetImageApi, type LinkfoxGenerateResponse } from "../../../api/images";
import { generateWorkbenchImage, modelChanged, normalizeImageSettings, type ImageModel } from "../../../api/generationModels";
import { useImageHistoryStore } from "../../../stores/imageHistoryStore.ts";
import { useJimengTaskStore } from "../../../stores/jimengTaskStore";
import { downloadImage } from "../../../utils/download";
import PromptOptimizer from "../../../components/PromptOptimizer.vue";
import { IMAGE_PROMPT_LIMIT } from "../../../components/promptLimits";
import HistoryImageItem from "./HistoryImageItem.vue";

type SubmitParam = {
  modelName: string;
  imageRatio: string;
  imageSize: string;
};

type HistoryImage = {
  uid: string;
  url: string;
  code: string;
  context: string;
  settings?: SubmitParam;
  createdAt?: string;
};

const props = defineProps<{
  taskId: number;
  taskNumber: number;
  param?: Partial<SubmitParam>;
  models: ImageModel[];
  defaultModelId: string;
}>();

const emit = defineEmits<{ duplicate: []; remove: []; refreshModels: [] }>();
const textStorageKey = `jimeng-task-text-${props.taskId}`;

const store = useJimengTaskStore();
const archive = useImageHistoryStore();

type UploadWithMeta = UploadFile & { base64?: string; mimeType?: string };
const uploadSlots = ref<UploadWithMeta[][]>(
  Array.from({ length: 4 }, () => []),
);
const draggingSlot = ref<number | null>(null);

const submitForm = ref<SubmitParam>({
  modelName: '', imageRatio: '', imageSize: '', ...props.param,
});
store.ensureTask(String(props.taskId));
const savedSettings = store.tasks[String(props.taskId)]?.settings;
if (savedSettings) submitForm.value = { ...savedSettings };
const modelOptions = computed(() => props.models.map(model => ({ label: model.name, value: model.id })));
const selectedModel = computed(() => props.models.find(model => model.id === submitForm.value.modelName));
// Keep the saved selection available for retry while the empty catalog hides it.
const visibleSettings = reactive({
  get modelName() { return selectedModel.value?.id ?? ''; },
  set modelName(value: string) { submitForm.value.modelName = value; },
  get imageRatio() { return selectedModel.value ? submitForm.value.imageRatio : ''; },
  set imageRatio(value: string) { submitForm.value.imageRatio = value; },
  get imageSize() { return selectedModel.value ? submitForm.value.imageSize : ''; },
  set imageSize(value: string) { submitForm.value.imageSize = value; },
});
function normalizeModelSettings(settings: SubmitParam) {
  return normalizeImageSettings(settings, props.models.find(model => model.id === settings.modelName));
}
watch(() => [props.models, props.defaultModelId, submitForm.value.modelName] as const, ([models, defaultId]) => {
  if (!submitForm.value.modelName && models.length) submitForm.value.modelName = defaultId;
  if (selectedModel.value) Object.assign(submitForm.value, normalizeModelSettings(submitForm.value));
}, { immediate: true });
watch(submitForm, settings => store.setTaskSettings(String(props.taskId), settings), { deep: true, immediate: true });

const currentText = ref<string>(accountStorage.getItem(textStorageKey) || "");
watch(currentText, (v) => {
  promptError.value = '';
  try { accountStorage.setItem(textStorageKey, v); }
  catch { ElMessage.warning('浏览器存储空间不足，提示词无法自动保存'); }
});

const responseLoading = computed(
  () => store.tasks[String(props.taskId)]?.responseLoading ?? false,
);
const showStatus = computed(
  () => store.tasks[String(props.taskId)]?.showStatus ?? "0",
);
const generatedTaskId = computed(
  () => store.tasks[String(props.taskId)]?.generatedTaskId ?? "",
);
const generationError = computed(
  () => showStatus.value === '3' ? store.tasks[String(props.taskId)]?.responseErrorText ?? '' : '',
);
const currentUrlCode = computed(
  () => store.tasks[String(props.taskId)]?.currentUrlCode ?? "",
);
const currentUrl = computed(
  () => store.tasks[String(props.taskId)]?.currentUrl ?? "",
);
const historyImageList = computed<HistoryImage[]>(
  () => store.tasks[String(props.taskId)]?.historyImageList ?? [],
);

const promptEditorOpen = ref(false);
const expandedPromptInput = ref<InputInstance>();
const promptLength = computed(() => currentText.value.length);
const promptLines = computed(() => currentText.value ? currentText.value.split('\n').length : 0);
const promptError = ref('');
const referenceError = ref('');
const pendingUploads = ref(0);
const requestSettling = ref(false);
const downloading = ref(false);
const requiresReference = computed(() => selectedModel.value?.referenceMode === 'upload');
function isBusy() { return responseLoading.value || requestSettling.value; }
function hasResult() { return !!currentUrl.value; }
function validateTask() {
  if (isBusy()) return false;
  const prompt = currentText.value.trim();
  promptError.value = !prompt ? '请填写提示词，描述想要的图片效果' :
    prompt.length > IMAGE_PROMPT_LIMIT ? `提示词最多支持 ${IMAGE_PROMPT_LIMIT} 个字符` : '';
  const count = uploadSlots.value.filter(slot => slot[0]?.base64).length;
  referenceError.value = !selectedModel.value ? '请选择可用模型' :
    count > selectedModel.value.capabilities.maxReferenceImages ? '参考图数量超过当前模型上限' :
    pendingUploads.value ? '参考图正在处理，请稍候再开始生成' : requiresReference.value && !uploadSlots.value.some(slot => slot[0]?.base64) ? '当前模型需要至少一张参考图' : '';
  return !promptError.value && !referenceError.value;
}
function applySettings(settings: SubmitParam) {
  if (!isBusy()) submitForm.value = normalizeModelSettings(settings);
}
function getDraft() {
  return { text: currentText.value, settings: { ...submitForm.value }, uploads: uploadSlots.value.map(slot => slot.map(file => ({ ...file }))) };
}
function setDraft(draft: ReturnType<typeof getDraft>) {
  if (isBusy()) return;
  currentText.value = draft.text;
  submitForm.value = normalizeModelSettings(draft.settings);
  uploadSlots.value = draft.uploads.map(slot => slot.map(file => ({ ...file })));
}
let generationDraft: { text: string; settings: SubmitParam; modelName: string } | null = null;

const isBasicBanana = computed(() => false);

const showRationOptions = computed(() => (selectedModel.value?.capabilities.ratios ?? []).map(value => ({ label: value, value })));
const showSizeOptions = computed(() => (selectedModel.value?.capabilities.sizes ?? []).map(value => ({ label: value, value })));
const historyPopoverWidth = ref(400);

function syncHistoryPopoverWidth() {
  historyPopoverWidth.value = Math.min(420, window.innerWidth - 32);
}

const previewImageRef = ref<{
  showPreview?: () => void;
  $el?: HTMLElement;
} | null>(null);
const previewSrcList = ref<string[]>([]);
const previewInitialIndex = ref(0);

let abortController: AbortController | null = null;
let abortRequestedByUser = false;

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function resolveImageSrc(urlOrBase64: string, code: string) {
  // 后端返回的 `images[0]` 是 URL 时，直接展示；
  // 旧逻辑返回 base64 时，才拼成 data url。
  if (!urlOrBase64) return "";
  if (isHttpUrl(urlOrBase64)) return urlOrBase64;
  if (!code) return urlOrBase64;
  return `data:${code};base64,${urlOrBase64}`;
}

async function getBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = (err) => reject(err);
  });
}

async function handleChange(slotIndex: number, file: UploadFile, files: UploadFile[]) {
  if (isBusy()) return;
  pendingUploads.value++;
  referenceError.value = '';
  try { await processUpload(slotIndex, file, files); }
  catch { uploadSlots.value[slotIndex] = []; referenceError.value = '图片处理失败，请重新选择 JPG 或 PNG 图片'; }
  finally { pendingUploads.value--; }
}

async function processUpload(
  slotIndex: number,
  _uploadFile: UploadFile,
  uploadFiles: UploadFile[],
) {
  const list = uploadFiles as UploadWithMeta[];
  // 先立即更新 file-list，避免空态/有态切换导致的布局抖动。
  uploadSlots.value[slotIndex] = list.length ? [list[0]] : [];
  const first = list[0];
  if (first?.raw) {
    const fileType = (first.raw as File).type;
    const allowed = fileType === "image/jpeg" || fileType === "image/png";
    if (!allowed) {
      uploadSlots.value[slotIndex] = [];
      referenceError.value = '仅支持上传 JPG/JPEG 或 PNG 格式图片';
      return;
    }
  }
  if (first?.raw && !first.base64) {
    const maxBytes = 1 * 1024 * 1024;

    let rawFile = first.raw as File;
    const shouldConvertToJpeg =
      rawFile.type === "image/jpeg" || rawFile.type === "image/png";

    // jpg/png 输入统一改成 .jpeg 文件名，输出 MIME 统一为 image/jpeg。
    if (shouldConvertToJpeg && !/\.jpeg$/i.test(rawFile.name)) {
      const jpegName = rawFile.name.replace(/\.[^./\\]+$/, ".jpeg");
      rawFile = new File([rawFile], jpegName, {
        type: "image/jpeg",
        lastModified: rawFile.lastModified,
      });
      first.name = jpegName;
    }

    // 显示层先用 objectURL，等压缩+转 base64 完成后再切换为 data URL。
    let tempObjectUrl: string | null = null;
    if (!first.url) {
      tempObjectUrl = URL.createObjectURL(rawFile);
      first.url = tempObjectUrl;
    } else if (first.url.startsWith("blob:")) {
      URL.revokeObjectURL(first.url);
      tempObjectUrl = URL.createObjectURL(rawFile);
      first.url = tempObjectUrl;
    }

    if (rawFile.size > maxBytes) {
      rawFile = (await imageCompression(rawFile, {
        maxSizeMB: 1,
        initialQuality: 0.92,
        maxIteration: 10,
        useWebWorker: true,
        ...(shouldConvertToJpeg ? { fileType: "image/jpeg" } : {}),
        // 尽量保持原图分辨率，通过降低质量来压缩到目标大小。
        alwaysKeepResolution: true,
      })) as File;
    } else if (shouldConvertToJpeg) {
      // 即使图片本身 < 1MB，也执行一次转换，确保 png 最终输出为 jpeg。
      rawFile = (await imageCompression(rawFile, {
        maxSizeMB: 1,
        initialQuality: 0.92,
        maxIteration: 1,
        useWebWorker: true,
        fileType: "image/jpeg",
        alwaysKeepResolution: true,
      })) as File;
    }

    // 保留分辨率的压缩可能达不到目标，必要时允许缩小尺寸。
    if (rawFile.size > maxBytes) {
      rawFile = await imageCompression(rawFile, {
        maxSizeMB: 1,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
    }
    if (rawFile.size > maxBytes) {
      if (tempObjectUrl) URL.revokeObjectURL(tempObjectUrl);
      uploadSlots.value[slotIndex] = [];
      referenceError.value = '参考图压缩后仍超过 1 MB，请换一张较小的图片';
      return;
    }

    // 压缩/转换后再次确保文件名为 .jpeg。
    if (shouldConvertToJpeg && !/\.jpeg$/i.test(rawFile.name)) {
      const jpegName = rawFile.name.replace(/\.[^./\\]+$/, ".jpeg");
      rawFile = new File([rawFile], jpegName, {
        type: "image/jpeg",
        lastModified: rawFile.lastModified,
      });
      first.name = jpegName;
    }

    // 更新 raw/mimeType，确保后续 base64/预览等使用压缩后的文件。
    first.raw = rawFile as any;
    first.mimeType = rawFile.type || first.mimeType;

    const dataUrl = await getBase64(rawFile);
    first.base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    first.url = dataUrl;

    if (tempObjectUrl) URL.revokeObjectURL(tempObjectUrl);
  }
}

function isAllowedImageFile(file: File) {
  if (file.type === "image/jpeg" || file.type === "image/png") return true;
  return /\.(jpe?g|png)$/i.test(file.name);
}

async function onUploadDrop(slotIndex: number, e: DragEvent) {
  draggingSlot.value = null;
  if (isBusy()) return;
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  const files = Array.from(dt.files);
  const imageFile = files.find((f) => isAllowedImageFile(f));
  if (!imageFile) {
    referenceError.value = '仅支持上传 JPG/JPEG 或 PNG 格式图片';
    return;
  }
  const prevUrl = uploadSlots.value[slotIndex]?.[0]?.url;
  if (prevUrl?.startsWith("blob:")) URL.revokeObjectURL(prevUrl);
  const uploadFile = {
    uid: Date.now(),
    name: imageFile.name,
    status: "ready" as const,
    raw: imageFile,
  } as UploadWithMeta;
  await handleChange(slotIndex, uploadFile, [uploadFile]);
}

function handleRemove(
  slotIndex: number,
  _uploadFile: UploadFile,
  uploadFiles: UploadFile[],
) {
  const list = uploadFiles as UploadWithMeta[];
  uploadSlots.value[slotIndex] = list.length ? [list[0]] : [];
}

function getChangeHandler(slotIndex: number) {
  return (uploadFile: UploadFile, uploadFiles: UploadFile[]) =>
    handleChange(slotIndex, uploadFile, uploadFiles);
}

function getRemoveHandler(slotIndex: number) {
  return (uploadFile: UploadFile, uploadFiles: UploadFile[]) =>
    handleRemove(slotIndex, uploadFile, uploadFiles);
}

async function handlePictureCardPreview(
  file: UploadFile & { base64?: string; mimeType?: string },
) {
  const code = file.mimeType ?? file.raw?.type ?? "image/png";
  let src = file.url ?? "";
  if (file.base64) {
    src = `data:${code};base64,${file.base64}`;
  } else if (file.raw) {
    const dataUrl = await getBase64(file.raw as File);
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    file.base64 = base64;
    file.mimeType = (file.raw as File).type;
    file.url = dataUrl;
    src = `data:${file.mimeType};base64,${base64}`;
  }
  if (!src) return;
  previewSrcList.value = [src];
  previewInitialIndex.value = 0;
  await nextTick();
  if (previewImageRef.value?.showPreview) {
    previewImageRef.value.showPreview();
    return;
  }
  previewImageRef.value?.$el
    ?.querySelector("img")
    ?.dispatchEvent(new MouseEvent("click"));
}

function cancelBtn() {
  if (!responseLoading.value) return;
  abortRequestedByUser = true;
  abortController?.abort();
  // Keep the aborted signal available to asynchronous upload/poll continuations.
  store.cancelTask(String(props.taskId));
}

function clearTextBtn() {
  if (isBusy()) return;
  currentText.value = "";
  accountStorage.removeItem(textStorageKey);
}

function clearReferenceImages() {
  if (isBusy()) return;
  for (const slot of uploadSlots.value) {
    const url = slot[0]?.url;
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }
  uploadSlots.value = Array.from({ length: 4 }, () => []);
  referenceError.value = '';
}
function clearResults() {
  if (!isBusy()) store.clearTaskImages(String(props.taskId));
}

function clearUploadSlot(slotIndex: number) {
  const u = uploadSlots.value[slotIndex]?.[0]?.url;
  if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
  uploadSlots.value[slotIndex] = [];
}

async function collectImageDataUrlList() {
  const slots = uploadSlots.value
    .map((slot) => slot[0])
    .filter(Boolean) as UploadWithMeta[];

  const list = await Promise.all(
    slots.map(async (file) => {
      if (file.url && /^data:image\/[^;]+;base64,/.test(file.url)) {
        return file.url;
      }
      if (file.raw) {
        const dataUrl = await getBase64(file.raw as File);
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        file.base64 = base64;
        file.mimeType = (file.raw as File).type;
        file.url = dataUrl;
        return dataUrl;
      }
      if (file.base64) {
        const mime = file.mimeType || "image/png";
        return `data:${mime};base64,${file.base64}`;
      }
      return "";
    }),
  );

  return list.filter((x) => !!x);
}

async function collectImageUrlList() {
  const slots = uploadSlots.value
    .map((slot) => slot[0])
    .filter(Boolean) as UploadWithMeta[];

  const list = await Promise.all(
    slots.map(async (file, idx) => {
      if (file.url && isHttpUrl(file.url)) {
        return file.url;
      }

      let fullBase64 = "";
      if (file.url && /^data:image\/[^;]+;base64,/.test(file.url)) {
        fullBase64 = file.url;
      } else if (file.raw) {
        fullBase64 = await getBase64(file.raw as File);
      } else if (file.base64) {
        const mime = file.mimeType || "image/png";
        fullBase64 = `data:${mime};base64,${file.base64}`;
      }

      if (!fullBase64) return "";

      const fileName =
        file.name ||
        (file.raw instanceof File
          ? file.raw.name
          : `upload-${Date.now()}-${idx}.png`);

      const uploadResp = await linxfoxUploadByBase64Api({
        modelId: generationDraft!.settings.modelName,
        fileName,
        base64: fullBase64,
      }, abortController?.signal);

      const outerCode = String(uploadResp?.code ?? "");
      const innerCode = Number((uploadResp?.data as any)?.code ?? NaN);
      const viewUrl = String((uploadResp?.data as any)?.data?.viewUrl ?? "");
      if (outerCode !== "0" || innerCode !== 200 || !viewUrl) {
        const errMsg = String(
          (uploadResp?.data as any)?.msg ?? uploadResp?.msg ?? "上传图片失败",
        );
        throw new Error(errMsg);
      }
      return viewUrl;
    }),
  );

  return list.filter((x: string) => !!x);
}

function validateUploadSizeLimit(taskId: string) {
  const maxBytes = 10 * 1024 * 1024;
  const files = uploadSlots.value
    .map((slot) => slot[0])
    .filter(Boolean) as UploadWithMeta[];

  for (const file of files) {
    const raw = file.raw as File | undefined;
    if (!raw) continue;
    if (raw.size > maxBytes) {
      store.setError(taskId, "上传图片大小不能超过10MB");
      return false;
    }
  }

  return true;
}

function waitWithAbort(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort);
  });
}

async function downloadBtn() {
  if (!currentUrl.value) return;
  const src = resolveImageSrc(currentUrl.value, currentUrlCode.value);
  await downloadImage(
    src,
    `task-${props.taskId}-${moment().format("YYYY-MM-DD-HH-mm-ss")}.png`,
  );
}

async function downloadWithFeedback() {
  if (!currentUrl.value || downloading.value) return;
  downloading.value = true;
  try { await downloadBtn(); ElMessage.success('已发起下载，请查看浏览器下载列表'); }
  catch { ElMessage.error('下载失败，请重试或使用“打开原图”另存图片'); }
  finally { downloading.value = false; }
}
async function downloadHistoryEvent(item: HistoryImage) {
  try { await downloadImage(resolveImageSrc(item.url, item.code), `task-${props.taskId}-${moment().format('YYYY-MM-DD-HH-mm-ss')}.png`); }
  catch { ElMessage.error('历史图片下载失败，请重试'); }
}
async function deleteHistoryEvent(item: HistoryImage) {
  if (isBusy()) return;
  try { await ElMessageBox.confirm('此记录将从任务卡的最近记录中移除，无法撤销。当前预览也可能被清空，历史模块中的归档图片仍会保留。', '移除最近记录', { type: 'warning', confirmButtonText: '移除记录', cancelButtonText: '取消' }); }
  catch { return; }
  if (!await archive.ensureSaved()) { ElMessage.error('历史归档尚未保存，请先下载重要图片后重试'); return; }
  if (!isBusy()) store.deleteHistoryItem(String(props.taskId), item.uid);
}
function viewHistoryEvent(item: HistoryImage) {
  if (isBusy()) return;
  store.viewHistoryItem(String(props.taskId), item);
  if (item.settings) applySettings(item.settings);
}
function reuseHistoryEvent(item: HistoryImage) {
  if (isBusy()) return;
  currentText.value = item.context;
  if (item.settings) applySettings(item.settings);
  ElMessage.success(item.settings ? '已复用提示词、模型、比例和分辨率；请核对参考图' : '已复用提示词；此旧记录没有保存模型参数，请手动核对');
}
function submitBtn2() {
  if (!validateTask()) return;
  generationDraft = { text: currentText.value.trim(), settings: { ...submitForm.value }, modelName: selectedModel.value!.name };

  const taskId = String(props.taskId);
  store.ensureTask(taskId);

  abortRequestedByUser = false;
  abortController?.abort();
  abortController = new AbortController();

  store.startTask(taskId);

  const timeoutId = window.setTimeout(() => {
    abortController?.abort();
  }, 1200000);
  store.setRequestTimerId(taskId, timeoutId);

  requestSettling.value = true;
  const submit = selectedModel.value?.referenceMode === 'upload' ? linkfoxImageImpl : ai147ImageImpl;
  void submit(taskId).finally(() => { requestSettling.value = false; });
}

async function ai147ImageImpl(taskId: string) {
  try {
    if (!validateUploadSizeLimit(taskId)) return;
    const settings = generationDraft!.settings;
    const imageList = await collectImageDataUrlList();
    abortController?.signal.throwIfAborted();
    const response = await generateWorkbenchImage<{ data: Array<{ url: string }> }>({
      modelId: settings.modelName,
      prompt: generationDraft!.text,
      imageList,
      aspectRatio: settings.imageRatio,
      resolution: settings.imageSize,
    }, abortController?.signal);
    abortController?.signal.throwIfAborted();
    const url = response.data?.[0]?.url;
    if (!url) {
      store.setError(taskId, '生成失败：147AI 未返回图片');
      return;
    }
    store.completeTaskWithPlaceholder(taskId, {
      url, code: '', context: generationDraft!.text, modelName: generationDraft!.modelName, settings,
    });
  } catch (error: unknown) {
    if (abortRequestedByUser) return;
    if (isAxiosError(error) && error.response?.status === 413) {
      store.setError(taskId, '参考图超过请求大小限制，请减少参考图数量或换用较小的图片');
      return;
    }
    if (modelChanged(error)) {
      emit('refreshModels');
      store.setError(taskId, '模型或可用参数已更新，请确认设置后重试');
      return;
    }
    store.setError(taskId, error instanceof Error ? error.message : '147AI 图片生成失败，请稍后重试');
  }
}

async function linkfoxResultImage(taskId: string, id: string): Promise<string> {
  for (let i = 0; i < 120; i++) {
    const queryResp = await linkfoxGetImageApi(
      { id: String(id) },
      abortController?.signal,
    );

    const outerCode = String(queryResp?.code ?? "");
    const innerCode = Number((queryResp?.data as any)?.code ?? NaN);
    if (outerCode !== "0" || innerCode !== 200) {
      const errMsg = String(
        (queryResp?.data as any)?.msg ?? queryResp?.msg ?? "unknown error",
      );
      store.setError(taskId, `Linkfox 查询失败：${errMsg}`);
      return "";
    }

    const resultData = (queryResp?.data as any)?.data ?? {};
    const firstUrl =
      resultData?.resultList?.find(
        (item: any) => item?.status === 1 && typeof item?.url === "string",
      )?.url ??
      resultData?.resultList?.[0]?.url ??
      "";

    const taskStatus = Number(resultData?.status ?? NaN);
    if (taskStatus === 3 && firstUrl) {
      return firstUrl;
    }

    if (taskStatus === 4) {
      const errMsg =
        resultData?.errorMsg ||
        resultData?.resultList?.[0]?.errorMsg ||
        "任务失败";
      store.setError(taskId, `Linkfox 任务失败：${errMsg}`);
      return "";
    }

    if (taskStatus === 3) {
      store.setError(taskId, "Linkfox 任务完成但未返回图片URL");
      return "";
    }

    if (taskStatus !== 1 && taskStatus !== 2) {
      store.setError(
        taskId,
        `Linkfox 任务状态异常：${String(taskStatus || "unknown")}`,
      );
      return "";
    }

    await waitWithAbort(15000, abortController?.signal);
  }

  store.setError(taskId, "Linkfox 查询超时：未获取到图片URL");
  return "";
}

async function linkfoxImageImpl(taskId: string) {
  try {
    if (!validateUploadSizeLimit(taskId)) return;

    const imageList = await collectImageUrlList();
    if (!imageList.length) {
      store.setError(taskId, "请至少上传一张图片");
      return;
    }
    const payload = {
      imageList,
      prompt: generationDraft!.text,
      modelId: generationDraft!.settings.modelName,
      resolution: generationDraft!.settings.imageSize,
      aspectRatio: generationDraft!.settings.imageRatio,
    };

    const resp = await generateWorkbenchImage<LinkfoxGenerateResponse>(payload, abortController?.signal);
    const outerCode = String(resp?.code ?? "");
    const innerCode = Number(resp?.data?.code ?? NaN);
    if (outerCode !== "0" || innerCode !== 200) {
      store.setError(
        taskId,
        `Linkfox 生成失败：${resp?.data?.msg ?? resp?.msg ?? "unknown error"}`,
      );
      return;
    }

    const id = resp?.data?.data?.id;
    if (!id) {
      store.setError(taskId, "Linkfox 生成失败：未返回任务ID");
      return;
    }
    store.setGeneratedTaskId(taskId, String(id));

    const firstUrl = await linkfoxResultImage(taskId, String(id));

    if (!firstUrl) {
      return;
    }

    store.completeTaskWithPlaceholder(taskId, {
      url: firstUrl,
      code: "",
      context: generationDraft?.text ?? currentText.value,
      modelName: generationDraft?.modelName,
      settings: generationDraft?.settings ?? { ...submitForm.value },
    });
  } catch (err: any) {
    if (abortRequestedByUser) return;
    if (isAxiosError(err) && err.response?.status === 413) {
      store.setError(taskId, '参考图超过请求大小限制，请换用较小的图片');
      return;
    }
    if (modelChanged(err)) {
      emit('refreshModels');
      store.setError(taskId, '模型或可用参数已更新，请确认设置后重试');
      return;
    }
    const msg = err?.message ?? "Linkfox 生成失败：请求已中断或超时";
    store.setError(taskId, msg);
  }
}

defineExpose({ submitBtn2, downloadBtn, clearTextBtn, clearReferenceImages, clearResults, isBusy, hasResult, validateTask, applySettings, getDraft, setDraft });

onMounted(() => {
  store.ensureTask(String(props.taskId));
  nextTick(syncHistoryPopoverWidth);
  window.addEventListener("resize", syncHistoryPopoverWidth);
});

onUnmounted(() => {
  window.removeEventListener("resize", syncHistoryPopoverWidth);
});
</script>

<style scoped>
.task-card { container-type: inline-size; container-name: task-card; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.task-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.task-heading { display: flex; align-items: center; gap: 10px; min-width: 0; }
.task-title { font-size: 14px; line-height: 1.5; white-space: nowrap; }
.task-status { display: inline-flex; align-items: center; font-size: 11px; line-height: 20px; padding: 0 7px; border-radius: 4px; color: var(--text-muted); background: #f1f2f6; white-space: nowrap; }
.status-1 { background: var(--brand-soft); color: var(--brand); }
.status-2 { background: #eef8f2; color: #278055; }
.status-3 { background: #fdf0ef; color: #b93b36; }
.task-actions { display: flex; gap: 4px; }
.task-actions .icon-action { width: 28px; height: 28px; min-height: 28px; padding: 0; border-color: transparent; background: transparent; color: var(--text-muted); }
.task-actions .icon-action:hover { background: var(--brand-soft); color: var(--brand); }
.task-actions .delete-action:not(:disabled):hover { color: #b93b36; background: #fdf0ef; }
.task-body { padding: 12px 14px 14px; }
.task-config { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr) minmax(0, .9fr); gap: 8px; margin-bottom: 14px; }
.config-field { min-width: 0; }
.config-field label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 5px; }
.config-field .el-select { width: 100%; }
.task-workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.input-content, .output-content { min-width: 0; min-height: 0; }
.field-heading { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 8px; line-height: 18px; }
.field-note { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.field-heading > span > .field-note { margin-left: 4px; }
.help-icon { color: #9a9fb0; font-size: 13px; }
.upload-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 58px)); gap: 8px; margin-bottom: 12px; }
.upload-area { min-width: 0; aspect-ratio: 1; position: relative; border-radius: 7px; }
.picture-wall, .uploaded-thumb-wrap { position: absolute; inset: 0; }
.picture-wall :deep(.el-upload--picture-card) { width: 100%; height: auto; aspect-ratio: 1; border-radius: 7px; border: 1px dashed #d9dce8; background: #fafaff; transition: border-color .15s, background .15s; }
.picture-wall :deep(.el-upload--picture-card:hover), .is-dragging .picture-wall :deep(.el-upload--picture-card) { border-color: var(--brand); background: var(--brand-soft); }
.upload-plus { width: 100%; height: 100%; display: grid; place-items: center; }
.upload-plus-inner { font-size: 20px; color: var(--brand); }
.uploaded-thumb { width: 100%; height: 100%; border-radius: 7px; border: 1px solid var(--border); }
.uploaded-delete-btn { position: absolute; right: -4px; top: -4px; display: grid; place-items: center; width: 24px; height: 24px; border: 2px solid white; border-radius: 50%; background: #55576b; color: white; cursor: pointer; padding: 0; }
.uploaded-delete-btn:hover { background: #b93b36; }
.text-content { margin-top: 2px; }
.prompt-box { container: prompt-box / inline-size; border: 1px solid var(--border); border-radius: 9px; }
.prompt-box:focus-within { border-color: var(--brand); }
.prompt-inline-input :deep(.el-textarea__inner) {
  height: 192px;
  min-height: 180px !important;
  max-height: 360px;
  overflow-y: auto;
  padding: 10px 12px;
  border-radius: 8px 8px 0 0;
  box-shadow: none;
}
.prompt-toolbar {
  display: grid;
  grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 0 0 8px 8px;
  background: var(--canvas);
}
.prompt-actions { display: flex; justify-self: start; }
.prompt-actions .el-button { width: 32px; height: 32px; padding: 0; }
.prompt-actions .el-button:first-child { border-radius: 8px 0 0 8px; }
.prompt-actions .el-button + .el-button { margin-left: -1px; border-radius: 0 8px 8px 0; }
.prompt-actions .el-button:hover,
.prompt-actions .el-button:focus-visible { z-index: 1; }
.prompt-count {
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.prompt-count-over { color: var(--el-color-danger); }
@container prompt-box (max-width: 250px) {
  .prompt-toolbar { grid-template-columns: auto 1fr; }
  .prompt-toolbar :deep(.prompt-optimizer-compact > .el-button) { justify-self: end; }
  .prompt-count { grid-column: 1 / -1; grid-row: 2; }
}
.output-content { display: flex; flex-direction: column; }
.output-content .output-image { flex: 1; min-height: 208px; }
.generation-actions { display: flex; gap: 8px; margin-top: 10px; }
.generate-button { flex: 1; }
.output-image { height: 208px; position: relative; display: flex; align-items: center; justify-content: center; background: #f8f9fc; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
.output-image.has-result { background: #f5f6f9; }
.preview-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px; font-size: 12px; color: var(--text-muted); text-align: center; }
.preview-empty .el-icon { font-size: 32px; color: #b5b3d7; }
.result-img { position: absolute; inset: 0; width: 100%; height: 100%; max-width: 100%; max-height: 100%; cursor: zoom-in; }
.result-img :deep(img) { display: block; width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; }
.result-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.result-actions > .el-button { flex: 1; }
.result-link { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 32px; border-radius: 6px; color: var(--text-muted); }
.result-link:hover { color: var(--brand); background: var(--brand-soft); }
.field-help { font-size: 11px; line-height: 1.5; min-height: 1lh; color: var(--text-muted); margin: 0; }
.field-error { color: #b42318; background: #fdf2f0; padding: 6px 8px; border-radius: 5px; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; margin: 6px 0; }
.inputs-locked { opacity: .6; }
.preview-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  gap: 8px;
  padding: 14px;
  overflow-y: auto;
  overflow-wrap: anywhere;
  text-align: center;
  font-size: 12px;
}
.preview-state > * { flex-shrink: 0; max-width: 100%; }
.preview-loading { background: rgb(255 255 255 / 94%); color: var(--brand); }
.preview-help { color: var(--text-muted); font-size: 11px; }
.preview-error { background: #fdf2f0; color: #b42318; }
.preview-error:focus-visible { outline: 2px solid currentColor; outline-offset: -3px; }
.spinner { width: 26px; height: 26px; border: 2px solid var(--brand-border); border-top-color: var(--brand); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.preview-bridge-image { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; left: -9999px; top: -9999px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@container task-card (min-width: 450px) { .task-workspace { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 14px; } }
@container task-card (min-width: 720px) {
  .task-config { max-width: 560px; }
  .task-workspace { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
  .output-image { height: 228px; }
  .upload-grid { grid-template-columns: repeat(4, 64px); }
}
@container task-card (max-width: 319px) {
  .task-header { padding: 10px 12px; }
  .task-body { padding: 12px; }
  .task-config { grid-template-columns: 1fr 1fr; }
  .model-config { grid-column: 1 / -1; }
  .upload-grid { gap: 6px; }
  .field-heading { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>

<style>
.prompt-editor-dialog.el-dialog { display: flex; flex-direction: column; height: 90vh; height: 90dvh; max-height: 90dvh; margin-bottom: 5vh; padding: 20px; border-radius: 12px; }
.prompt-editor-dialog .el-dialog__header { flex-shrink: 0; margin: 0; padding: 0 30px 16px 0; }
.prompt-editor-dialog .el-dialog__body { display: flex; flex: 1; min-height: 0; padding: 0; overflow: hidden; }
.prompt-editor-dialog .el-dialog__footer { flex-shrink: 0; padding: 16px 0 0; }
.prompt-editor-heading h2 { font-size: 16px; line-height: 1.5; }
.prompt-editor-heading p { color: var(--text-muted); font-size: 12px; margin-top: 4px; }
.prompt-editor-dialog .prompt-expanded-input { display: flex; height: 100%; }
.prompt-editor-dialog .el-textarea__inner { flex: 1; height: 100% !important; min-height: 0 !important; resize: none; overflow-y: auto; font-size: 14px; line-height: 1.8; padding: 16px; }
.prompt-editor-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.prompt-editor-footer > span { color: var(--text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
@media (max-width: 600px) {
  .prompt-editor-dialog.el-dialog { width: 100vw !important; height: 100dvh; max-height: 100dvh; margin: 0 !important; padding: 16px; border-radius: 0; }
  .prompt-editor-dialog .el-textarea__inner { padding: 12px; font-size: 16px; }
  .prompt-editor-dialog .el-dialog__footer { padding-bottom: env(safe-area-inset-bottom, 0px); }
}
</style>
