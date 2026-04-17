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
              @drop.prevent="onUploadDrop(slotIndex, $event)"
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
                :on-remove="getRemoveHandler(slotIndex)"
                :on-change="getChangeHandler(slotIndex)"
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
            @click="submitBtn2"
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
  generateImagesByPromptV2Api,
  getImageTaskResultApi,
  linxfoxUploadByBase64Api,
  linkfoxGetImageApi,
  linkfoxGenerateApi,
  qianwenImageApi,
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
  modelName: modelOptions[0]?.value ?? "jimeng_seedream46_cvtob",
  imageRatio: ratioOptions[0]?.value ?? "3.4",
  imageSize: sizeOptions[0]?.value ?? "3K",
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
      store.setError(
        String(props.taskId),
        "仅支持上传 JPG/JPEG 或 PNG 格式图片",
      );
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
        initialQuality: 1,
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
        initialQuality: 1,
        maxIteration: 1,
        useWebWorker: true,
        fileType: "image/jpeg",
        alwaysKeepResolution: true,
      })) as File;
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
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  const files = Array.from(dt.files);
  const imageFile = files.find((f) => isAllowedImageFile(f));
  if (!imageFile) {
    store.setError(String(props.taskId), "仅支持上传 JPG/JPEG 或 PNG 格式图片");
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
        fileName,
        base64: fullBase64,
      });

      const outerCode = String(uploadResp?.code ?? "");
      const innerCode = Number((uploadResp?.data as any)?.code ?? NaN);
      const viewUrl = String((uploadResp?.data as any)?.data?.viewUrl ?? "");
      if (outerCode !== "0" || innerCode !== 200 || !viewUrl) {
        const errMsg = String((uploadResp?.data as any)?.msg ?? uploadResp?.msg ?? "上传图片失败");
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

function extractTaskIdFromResp(resp: any) {
  return (
    resp?.data?.taskId ??
    resp?.taskId ??
    resp?.data?.task_id ??
    resp?.task_id ??
    ""
  );
}

function extractTaskStatus(resp: any): string {
  return (
    resp?.data?.status ??
    resp?.status ??
    resp?.raw?.status ??
    resp?.data?.resp_data?.status ??
    ""
  );
}

function extractImageFromTaskResult(data: any): { url: string; code: string } {
  if (!data || typeof data !== "object") return { url: "", code: "" };

  const imageUrl =
    data?.image_urls?.[0] ??
    data?.images?.[0] ??
    data?.resp_data?.image_urls?.[0] ??
    data?.resp_data?.images?.[0] ??
    "";
  if (typeof imageUrl === "string" && imageUrl) {
    return { url: imageUrl, code: "" };
  }

  const base64 =
    data?.binary_data_base64?.[0] ??
    data?.b64_images?.[0] ??
    data?.resp_data?.binary_data_base64?.[0] ??
    data?.resp_data?.b64_images?.[0] ??
    "";
  if (typeof base64 === "string" && base64) {
    return { url: base64, code: "image/png" };
  }

  return { url: "", code: "" };
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
import { recommendedSizeMap } from "../js/config";
function submitBtn() {
  if (!currentText.value.trim()) {
    return;
  }

  const taskId = String(props.taskId);
  store.ensureTask(taskId);

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
      "3k": {
        "21:9": "3840x1728",
        "16:9": "3840x2160",
        "9:16": "2160x3840",
        "4:3": "3072x2304",
        "3:4": "2304x3072",
        "1:1": "3072x3072",
        "3:2": "3072x2048",
        "2:3": "2048x3072",
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
      const isFuseModel =
        submitForm.value.modelName === "jimeng_t2i_v40" ||
        submitForm.value.modelName === "jimeng_seedream46_cvtob";
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

        const taskStatus = extractTaskStatus(taskResp);
        if (taskStatus === "not_found") {
          store.setError(taskId, "任务未找到，可能已过期（12小时）或不存在");
          return;
        }
        if (taskStatus === "expired") {
          store.setError(taskId, "任务已过期，请重新提交任务");
          return;
        }

        const extracted = extractImageFromTaskResult(taskResp.data);
        firstImageUrl = extracted.url;
        imageCode = extracted.code;

        if (taskStatus === "done") {
          if (firstImageUrl) break;
          store.setError(
            taskId,
            `任务已完成但无图片结果：${taskResp.message ?? "unknown error"}`,
          );
          return;
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

function submitBtn2() {
  if (!currentText.value.trim()) {
    return;
  }

  const taskId = String(props.taskId);
  store.ensureTask(taskId);

  abortRequestedByUser = false;
  abortController?.abort();
  abortController = new AbortController();

  store.startTask(taskId);

  const timeoutId = window.setTimeout(() => {
    abortController?.abort();
  }, 120000);
  store.setRequestTimerId(taskId, timeoutId);

  const selectedModel = submitForm.value.modelName;
  const isDoubaoModel =
    selectedModel === "doubao-seedream-4-5-251128" ||
    selectedModel === "doubao-seedream-5-0-260128";

  if (isDoubaoModel) {
    void doubaoImageImpl(taskId);
    return;
  }

  const isQianwenModel =
    selectedModel === "qwen-image-2.0-pro" ||
    selectedModel === "wan2.7-image-pro" ||
    selectedModel === "wan2.7-image";

  if (isQianwenModel) {
    void qianwenImageImpl(taskId);
    return;
  }

  const isLinkfoxModel =
    selectedModel === "BANANA_2" || selectedModel === "BANANA_PRO";

  if (isLinkfoxModel) {
    void linkfoxImageImpl(taskId);
    return;
  }

  store.setError(taskId, "当前模型未接入 submitBtn2 逻辑");
}

async function doubaoImageImpl(taskId: string) {
  try {
    if (!validateUploadSizeLimit(taskId)) return;

    const imageDataUrlList = await collectImageDataUrlList();
    const imageField =
      imageDataUrlList.length <= 1 ? imageDataUrlList[0] : imageDataUrlList;
    const payload = {
      model: submitForm.value.modelName,
      prompt:
        currentText.value.trim() +
        `。返回的图片宽高像素值为${recommendedSizeMap[submitForm.value.imageSize]?.[submitForm.value.imageRatio]}。`,
      image: imageField,
      size: submitForm.value.imageSize,
    };
    const resp = await generateImagesByPromptV2Api(
      payload,
      abortController?.signal,
    );
    const firstUrl =
      resp?.data?.[0]?.url ??
      (Array.isArray(resp?.data) ? "" : (resp as any)?.data?.url) ??
      (resp as any)?.url ??
      "";
    if (!firstUrl) {
      store.setError(taskId, "生成失败：V2 接口未返回图片 URL");
      return;
    }

    store.completeTaskWithPlaceholder(taskId, {
      url: firstUrl,
      code: "",
      context: currentText.value,
    });
  } catch (err: any) {
    if (abortRequestedByUser) return;
    const msg = err?.message ?? "V2 生成失败：请求已中断或超时";
    store.setError(taskId, msg);
  }
}

async function qianwenImageImpl(taskId: string) {
  try {
    if (!validateUploadSizeLimit(taskId)) return;

    const imageDataUrlList = await collectImageDataUrlList();
    const size =
      submitForm.value.modelName === "qwen-image-2.0-pro"
        ? recommendedSizeMap[submitForm.value.imageSize]?.[
            submitForm.value.imageRatio
          ]
        : submitForm.value.imageSize;
    const content: Array<{ text: string } | { image: string }> = [
      {
        text:
          currentText.value.trim() +
          `。返回的图片宽高像素值为${
            recommendedSizeMap[submitForm.value.imageSize]?.[
              submitForm.value.imageRatio
            ]
          }。`,
      },
    ];

    imageDataUrlList.forEach((img) => {
      content.push({ image: img });
    });

    const payload = {
      model: submitForm.value.modelName,
      input: {
        messages: [
          {
            role: "user" as const,
            content,
          },
        ],
      },
      parameters: {
        prompt_extend: true,
        watermark: false,
        n: 1,
        enable_interleave: false,
        size: size.replace("x", "*"),
      },
    };

    const resp = await qianwenImageApi(payload, abortController?.signal);
    const firstUrl =
      resp?.output?.choices?.[0]?.message?.content?.find(
        (item: any) =>
          item?.type === "image" && typeof item?.image === "string",
      )?.image ??
      resp?.output?.choices?.[0]?.message?.content?.[0]?.image ??
      "";

    if (!firstUrl) {
      store.setError(taskId, "生成失败：千问接口未返回图片 URL");
      return;
    }

    store.completeTaskWithPlaceholder(taskId, {
      url: firstUrl,
      code: "",
      context: currentText.value,
    });
  } catch (err: any) {
    if (abortRequestedByUser) return;
    const msg = err?.message ?? "千问生成失败：请求已中断或超时";
    store.setError(taskId, msg);
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
      const errMsg = String((queryResp?.data as any)?.msg ?? queryResp?.msg ?? "unknown error");
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
      store.setError(taskId, `Linkfox 任务状态异常：${String(taskStatus || "unknown")}`);
      return "";
    }

    await waitWithAbort(1500, abortController?.signal);
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
      prompt: currentText.value.trim(),
      provider: submitForm.value.modelName,
      outputNum: 1,
      resolution: submitForm.value.imageSize,
      aspectRatio: submitForm.value.imageRatio,
    };

    const resp = await linkfoxGenerateApi(payload, abortController?.signal);
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

    const firstUrl = await linkfoxResultImage(taskId, String(id));

    if (!firstUrl) {
      return;
    }

    store.completeTaskWithPlaceholder(taskId, {
      url: firstUrl,
      code: "",
      context: currentText.value,
    });
  } catch (err: any) {
    if (abortRequestedByUser) return;
    const msg = err?.message ?? "Linkfox 生成失败：请求已中断或超时";
    store.setError(taskId, msg);
  }
}

defineExpose({
  submitBtn,
  submitBtn2,
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
