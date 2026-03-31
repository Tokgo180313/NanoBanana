<template>
  <div>
    <el-card class="box-card" size="small">
      <template #header>
        <div class="box-header">
          <div>任务 {{ taskId }}</div>
          <div class="result-status">
            <div class="is-not-start status" v-if="showStatus === '0'">
              未开始
            </div>
            <div class="is-pending status" v-else-if="showStatus === '1'">
              生成中
            </div>
            <div class="is-finish status" v-else-if="showStatus === '2'">
              已完成
            </div>
            <el-tooltip
              v-else
              effect="dark"
              placement="top"
              :disabled="!responseErrorText"
            >
              <template #content>
                <div style="max-width: 400px">{{ responseErrorText }}</div>
              </template>
              <div class="is-error status">失败</div>
            </el-tooltip>
          </div>
        </div>
      </template>

      <div class="container">
        <div class="input-content">
          <div class="condition">
            <div>
              <el-select
                v-model="submitForm.modelName"
                placeholder="模型"
                size="small"
                style="width: 160px"
              >
                <el-option
                  v-for="item in modelOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </div>
            <div>
              <el-select
                v-model="submitForm.imageRatio"
                placeholder="比例"
                size="small"
                style="width: 110px"
              >
                <el-option
                  v-for="item in showRationOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </div>
          </div>

          <div class="upload-grid">
            <div
              v-for="(slotFiles, slotIndex) in uploadSlots"
              :key="`upload-slot-${slotIndex}`"
              class="upload-area"
              :style="{
                borderColor:
                  draggingSlot === slotIndex ? '#409eff' : 'transparent',
              }"
              @dragover.prevent="draggingSlot = slotIndex"
              @dragleave.prevent="
                draggingSlot = draggingSlot === slotIndex ? null : draggingSlot
              "
              @drop.prevent="draggingSlot = null"
            >
              <el-upload
                v-if="slotFiles.length === 0"
                list-type="picture-card"
                :limit="1"
                :auto-upload="false"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                :multiple="false"
                :file-list="slotFiles"
                :on-preview="handlePictureCardPreview"
                :on-remove="
                  (uploadFile, uploadFiles) =>
                    handleRemove(slotIndex, uploadFile, uploadFiles)
                "
                :on-change="
                  (uploadFile, uploadFiles) =>
                    handleChange(slotIndex, uploadFile, uploadFiles)
                "
                class="picture-wall"
              >
                <template #default>
                  <div class="upload-plus">
                    <div class="upload-plus-inner">+</div>
                  </div>
                </template>
              </el-upload>

              <div v-else class="uploaded-thumb-wrap">
                <el-image
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
                  @click.stop="clearUploadSlot(slotIndex)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div ref="textContentRef" class="text-content">
            <el-input
              type="textarea"
              v-model="currentText"
              :rows="12"
              placeholder="请输入图片生成描述词..."
            />
          </div>
        </div>

        <div class="output-content">
          <div v-if="!isBasicBanana">
            <el-select
              v-model="submitForm.imageSize"
              placeholder="分辨率"
              size="small"
              style="width: 110px"
            >
              <el-option
                v-for="item in showSizeOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </div>

          <div
            class="submit-button button"
            @click="submitBtn"
            :disabled="responseLoading"
            :class="responseLoading ? 'diabled-use' : ''"
          >
            {{ responseLoading ? "生成中" : "开始生成" }}
          </div>
          <div class="break-button button" @click="cancelBtn">中断</div>

          <div
            class="output-image border"
            :class="responseLoading ? 'diabled-image' : ''"
          >
            <el-image
              v-if="currentUrl"
              :src="resolveImageSrc(currentUrl, currentUrlCode)"
              class="result-img"
              fit="contain"
              :preview-src-list="[resolveImageSrc(currentUrl, currentUrlCode)]"
            />
            <div v-else class="error-text">生成结果将展示在这里....</div>
            <div v-show="responseLoading" class="loading-inner">
              <div class="spinner" />
              <span class="loading-text">生成中...</span>
            </div>
          </div>

          <div class="download-button button" @click="downloadBtn">下载</div>

          <HistoryImageItem
            :history-image-list="historyImageList"
            :resolve-image-src="resolveImageSrc"
            :popover-width="historyPopoverWidth"
            @view="viewHistoryEvent"
            @download="downloadHistoryEvent"
            @delete="deleteHistoryEvent"
          />
        </div>
      </div>

      <el-image
        ref="previewImageRef"
        :src="previewSrcList[previewInitialIndex] || ''"
        :preview-src-list="previewSrcList"
        :initial-index="previewInitialIndex"
        preview-teleported
        class="preview-bridge-image"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { UploadFile } from "element-plus";
import imageCompression from "browser-image-compression";
import moment from "moment";
import {
  fuseImagesApi,
  generateImagesByPromptApi,
  getImageTaskResultApi,
} from "../../../api/images";
import { useJimengTaskStore } from "../../../stores/jimengTaskStore";
import { modelOptions, ratioOptions, sizeOptions } from "../js/config";
import { downloadImage } from "../../../utils/download";
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
};

const props = defineProps<{
  taskId: number | string;
  param?: Partial<SubmitParam>;
}>();

const textStorageKey = `jimeng-task-text-${props.taskId}`;

const store = useJimengTaskStore();

type UploadWithMeta = UploadFile & { base64?: string; mimeType?: string };
const uploadSlots = ref<UploadWithMeta[][]>(
  Array.from({ length: 4 }, () => []),
);
const draggingSlot = ref<number | null>(null);

const submitForm = ref<SubmitParam>({
  modelName: modelOptions[0]?.value ?? "Banana Pro",
  imageRatio: ratioOptions[0]?.value ?? "3.4",
  imageSize: sizeOptions[0]?.value ?? "4K",
});

watch(
  () => props.param,
  (newVal) => {
    if (!newVal) return;
    submitForm.value = {
      ...submitForm.value,
      modelName: newVal.modelName ?? submitForm.value.modelName,
      imageRatio: newVal.imageRatio ?? submitForm.value.imageRatio,
      imageSize: newVal.imageSize ?? submitForm.value.imageSize,
    };
  },
  { deep: true, immediate: true },
);

const currentText = ref<string>(localStorage.getItem(textStorageKey) || "");
watch(currentText, (v) => localStorage.setItem(textStorageKey, v));

const responseLoading = computed(
  () => store.tasks[String(props.taskId)]?.responseLoading ?? false,
);
const showStatus = computed(
  () => store.tasks[String(props.taskId)]?.showStatus ?? "0",
);
const responseErrorText = computed(
  () => store.tasks[String(props.taskId)]?.responseErrorText ?? "",
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

const isBasicBanana = computed(() => false);

const showRationOptions = computed(() => ratioOptions);
const showSizeOptions = computed(() => sizeOptions);
const textContentRef = ref<HTMLElement | null>(null);
const historyPopoverWidth = ref(400);

function syncHistoryPopoverWidth() {
  const width = textContentRef.value?.clientWidth;
  if (width && width > 0) historyPopoverWidth.value = width;
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

async function handleChange(
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
      store.setError(String(props.taskId), "仅支持上传 JPG/JPEG 或 PNG 格式图片");
      return;
    }
  }
  if (first?.raw && !first.base64) {
    const maxBytes = 5 * 1024 * 1024;

    let rawFile = first.raw as File;

    // 兼容 .jpg：自动改成 .jpeg 文件名，MIME 保持 image/jpeg。
    if (rawFile.type === "image/jpeg" && /\.jpg$/i.test(rawFile.name)) {
      const jpegName = rawFile.name.replace(/\.jpg$/i, ".jpeg");
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
        maxSizeMB: 5,
        initialQuality: 1,
        maxIteration: 10,
        useWebWorker: true,
        // 尽量保持原图分辨率，通过降低质量来压缩到目标大小。
        alwaysKeepResolution: true,
      })) as File;
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

function handleRemove(
  slotIndex: number,
  _uploadFile: UploadFile,
  uploadFiles: UploadFile[],
) {
  const list = uploadFiles as UploadWithMeta[];
  uploadSlots.value[slotIndex] = list.length ? [list[0]] : [];
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
  abortRequestedByUser = true;
  abortController?.abort();
  abortController = null;
  store.cancelTask(String(props.taskId));
}

function clearTextBtn() {
  currentText.value = "";
  localStorage.removeItem(textStorageKey);
}

function clearImagesBtn() {
  for (const slot of uploadSlots.value) {
    const u = slot[0]?.url;
    if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
  }
  uploadSlots.value = Array.from({ length: 4 }, () => []);
  store.clearTaskImages(String(props.taskId));
}

function clearUploadSlot(slotIndex: number) {
  const u = uploadSlots.value[slotIndex]?.[0]?.url;
  if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
  uploadSlots.value[slotIndex] = [];
}

async function collectImageBase64List() {
  const slots = uploadSlots.value
    .map((slot) => slot[0])
    .filter(Boolean) as UploadWithMeta[];
  const list = await Promise.all(
    slots.map(async (file) => {
      if (file.base64) return file.base64;
      if (file.raw) {
        const dataUrl = await getBase64(file.raw as File);
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
        file.base64 = base64;
        file.mimeType = (file.raw as File).type;
        file.url = dataUrl;
        return base64;
      }
      return "";
    }),
  );
  return list.filter((x) => !!x);
}

function extractTaskIdFromResp(resp: any) {
  return (
    resp?.data?.taskId ??
    resp?.taskId ??
    resp?.data?.task_id ??
    resp?.task_id ??
    ""
  );
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

function downloadBtn() {
  if (!currentUrl.value) return;
  const src = resolveImageSrc(currentUrl.value, currentUrlCode.value);
  downloadImage(
    src,
    `task-${props.taskId}-${moment().format("YYYY-MM-YY-HH-mm-ss")}.png`,
  );
}

function downloadHistoryEvent(item: HistoryImage) {
  const src = resolveImageSrc(item.url, item.code);
  downloadImage(
    src,
    `task-${props.taskId}-${moment().format("YYYY-MM-YY-HH-mm-ss")}.png`,
  );
}

function deleteHistoryEvent(item: HistoryImage) {
  store.deleteHistoryItem(String(props.taskId), item.uid);
}

function viewHistoryEvent(item: HistoryImage) {
  currentText.value = item.context;
  store.viewHistoryItem(String(props.taskId), item);
}

function submitBtn() {
  const taskId = String(props.taskId);
  store.ensureTask(taskId);
  if (!currentText.value.trim()) {
    store.setError(taskId, "请输入图片生成描述词...");
    return;
  }

  // 调用后端生成接口；后端返回的是 `images[0]` URL。
  abortRequestedByUser = false;
  abortController?.abort();
  abortController = new AbortController();

  store.startTask(taskId);

  const sizeParam = (() => {
    const sizeRaw = (submitForm.value.imageSize ?? "").toString().trim();
    const sizeLower = sizeRaw.toLowerCase();
    const ratioRaw = (submitForm.value.imageRatio ?? "").toString().trim();

    // 若直接给了 WxH，则优先使用。
    if (/^\d+\s*x\s*\d+$/.test(sizeLower)) return sizeLower.replace(/\s+/g, "");

    // 优先使用官方推荐分辨率，避免自行计算带来的偏差。
    const recommendedSizeMap: Record<string, Record<string, string>> = {
      "2k": {
        "21:9": "3024x1296",
        "16:9": "2560x1440",
        "9:16": "1440x2560",
        "4:3": "2304x1728",
        "3:4": "1728x2304",
        "1:1": "2048x2048",
        "3:2": "2496x1664",
        "2:3": "1664x2496",
      },
      "4k": {
        "21:9": "6198x2656",
        "16:9": "5404x3040",
        "9:16": "3040x5404",
        "4:3": "4694x3520",
        "3:4": "3520x4694",
        "1:1": "4096x4096",
        "3:2": "4992x3328",
        "2:3": "3328x4992",
      },
    };
    const recommended = recommendedSizeMap[sizeLower]?.[ratioRaw];
    if (recommended) return recommended;

    const ratioMatch = ratioRaw.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!ratioMatch) {
      if (sizeLower === "2k") return "2048x2048";
      if (sizeLower === "4k") return "4096x4096";
      return "512x512";
    }

    const rw = Number(ratioMatch[1]);
    const rh = Number(ratioMatch[2]);
    if (!rw || !rh) return "512x512";

    // 以 imageSize 对应的“长边像素”作为基准，再按比例计算短边。
    // 例如 16:9 + 2K => 2560x1440。
    const longEdgeBySize: Record<string, number> = {
      "2k": 2560,
      "4k": 4096,
    };
    const longEdge = longEdgeBySize[sizeLower];
    if (!longEdge) return "512x512";

    let width = longEdge;
    let height = longEdge;
    if (rw >= rh) {
      // 横图：宽固定为长边
      height = Math.max(1, Math.round((longEdge * rh) / rw));
    } else {
      // 竖图：高固定为长边
      width = Math.max(1, Math.round((longEdge * rw) / rh));
    }
    return `${width}x${height}`;
  })();

  const [widthStr, heightStr] = sizeParam.split("x");
  const width = Number(widthStr) || 512;
  const height = Number(heightStr) || 512;

  const payload = {
    prompt: currentText.value.trim(),
    size: sizeParam,
    width,
    height,
    n: 1,
    extra: { return_url: true },
  };

  const timeoutId = window.setTimeout(() => {
    abortController?.abort();
  }, 120000);
  store.setRequestTimerId(taskId, timeoutId);
  (async () => {
    try {
      const isFuseModel = submitForm.value.modelName === "jimeng_t2i_v40";
      let firstImageUrl = "";
      let imageCode = "";
      let generatedTaskId = "";

      if (isFuseModel) {
        const imageBase64List = await collectImageBase64List();
        if (imageBase64List.length === 0) {
          store.setError(taskId, "请至少上传一张图片");
          return;
        }

        const fuseResp = await fuseImagesApi(
          {
            imageBase64List,
            prompt: currentText.value.trim(),
            size: sizeParam,
            width,
            height,
            reqKey: submitForm.value.modelName,
            extra: { return_url: true },
          },
          abortController?.signal,
        );

        if (fuseResp.code !== 0) {
          store.setError(
            taskId,
            `融合失败：${fuseResp.message ?? "unknown error"}`,
          );
          return;
        }
        generatedTaskId = extractTaskIdFromResp(fuseResp);
      } else {
        const json = await generateImagesByPromptApi(
          payload,
          abortController?.signal,
        );

        if (json.code !== 0) {
          store.setError(
            taskId,
            `生成失败：${json.message ?? "unknown error"}`,
          );
          return;
        }
        generatedTaskId = extractTaskIdFromResp(json);
      }

      if (!generatedTaskId) {
        store.setError(taskId, "生成失败：未获取到 task_id");
        return;
      }

      // 轮询任务结果：每 1~2 秒请求一次，直到 images 非空。
      for (let i = 0; i < 120; i++) {
        const taskResp = await getImageTaskResultApi(
          { taskId: generatedTaskId, reqKey: submitForm.value.modelName },
          abortController?.signal,
        );
        if (taskResp.code !== 0) {
          store.setError(
            taskId,
            `查询结果失败：${taskResp.message ?? "unknown error"}`,
          );
          return;
        }

        firstImageUrl = taskResp.data?.images?.[0] ?? "";
        if (!firstImageUrl && taskResp.data?.b64_images?.[0]) {
          firstImageUrl = taskResp.data.b64_images[0];
          imageCode = "image/png";
        }

        if (firstImageUrl) break;
        await waitWithAbort(1500, abortController?.signal);
      }

      if (!firstImageUrl) {
        store.setError(taskId, "生成失败：轮询超时，未获取到 images[0]");
        return;
      }

      store.completeTaskWithPlaceholder(taskId, {
        url: firstImageUrl,
        // URL 场景无需 code；若返回的是 b64_images，则使用 image/png 进行 data url 拼接。
        code: imageCode,
        context: currentText.value,
      });
    } catch (err: any) {
      if (abortRequestedByUser) return;
      const msg = err?.message ?? "生成失败：请求已中断或超时";
      store.setError(taskId, msg);
    }
  })();
}

defineExpose({
  submitBtn,
  downloadBtn,
  clearTextBtn,
  clearImagesBtn,
  cancelBtn,
});

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
.box-header {
  display: flex;
  justify-content: space-between;
}

.border {
  border: 1px dotted rgb(144, 147, 153);
}

.button {
  cursor: pointer;
  text-align: center;
  border: 1px solid #4f46e5;
  border-radius: 5px;
  margin: 0.5em 0;
  line-height: 32px;
  height: 32px;
  user-select: none;
}

.break-button {
  color: rgb(246, 108, 145);
  border-color: rgb(246, 108, 145);
}

.submit-button {
  color: #fff;
  background: #4f46e5;
}

.container {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.input-content {
  width: 62%;
}

.output-content {
  width: 38%;
}

.upload-area {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  padding: 0;
  overflow: hidden;
}

.upload-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 0.6em;
}

:deep(.upload-grid .el-upload-list--picture-card .el-upload-list__item) {
  width: 64px;
  height: 64px;
  transition: none;
}

:deep(.upload-grid .el-upload--picture-card) {
  width: 64px;
  height: 64px;
  transition: none;
}

.picture-wall {
  width: 100%;
}

.upload-plus {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  border: 1px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.upload-plus-inner {
  color: #4b73ff;
  font-size: 28px;
  line-height: 1;
}

.uploaded-thumb {
  width: 64px;
  height: 64px;
  border-radius: 10px;
}

:deep(.uploaded-thumb .el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.uploaded-thumb-wrap {
  position: relative;
  width: 64px;
  height: 64px;
}

.uploaded-delete-btn {
  position: absolute;
  right: 2px;
  top: 2px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  padding: 0;
  line-height: 16px;
  text-align: center;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  cursor: pointer;
}

.uploaded-delete-btn:hover {
  background: rgba(0, 0, 0, 0.75);
}

.output-image {
  width: 100%;
  background: #fff;
  aspect-ratio: 1 / 1;
  text-align: center;
  font-size: 0.8rem;
  border-radius: 0.5em;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-img {
  max-height: 85%;
  max-width: 85%;
  cursor: pointer;
  min-height: 8.5vw;
  border-radius: 0.5em;
}

:deep(.result-img .el-image__inner) {
  border-radius: 0.5em;
}

.status {
  font-size: 0.8rem;
  border-radius: 0.5em;
  padding: 0.2em 0.6em;
  text-align: center;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.is-not-start {
  border: 1px solid rgb(144, 147, 153);
  color: rgb(144, 147, 153);
  background: rgb(233, 233, 235);
}

.is-pending {
  border: 1px solid rgb(64, 158, 255);
  color: rgb(64, 158, 255);
  background: rgb(217, 236, 255);
}

.is-finish {
  border: 1px solid rgb(103, 194, 58);
  color: rgb(103, 194, 58);
  background: rgb(225, 243, 216);
}

.is-error {
  border: 1px solid rgb(245, 108, 108);
  color: rgb(245, 108, 108);
  background: rgb(253, 226, 226);
}

.diabled-use {
  background: rgba(79, 70, 229, 0.6);
  border-color: rgba(79, 70, 229, 0.6);
}

.diabled-image {
  opacity: 0.7;
}

.error-text {
  opacity: 0.7;
  font-size: 0.7rem;
}

.loading-inner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 8px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid #e0e0e0;
  border-top: 2px solid rgb(79, 70, 229);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: #666;
  font-size: 14px;
}

.condition {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5em;
  gap: 10px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
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
:deep(.el-card__header) {
  padding: 0.6em 20px;
}

.preview-bridge-image {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
  left: -9999px;
  top: -9999px;
}

.history-actions {
  display: flex;
  gap: 8px;
}

.empty-history {
  padding: 6px 0;
  color: #999;
  font-size: 12px;
  text-align: center;
}

.disabled-history {
  opacity: 0.55;
  pointer-events: none;
}
</style>
