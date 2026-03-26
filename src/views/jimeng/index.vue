<template>
  <div class="gemini-container">

    <div class="gemini-header">
      <el-card class="box-card">
        <div class="content">
          <div class="submit">
            <el-form :model="submitForm" :inline="true" size="small">
              <el-form-item label="模型" prop="modelName">
                <el-select v-model="submitForm.modelName" style="width: 150px" placeholder="模型">
                  <el-option
                    v-for="item in modelOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item label="比例" prop="imageRatio">
                <el-select v-model="submitForm.imageRatio" style="width: 120px" placeholder="比例">
                  <el-option
                    v-for="item in showRationOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item v-if="!isBasicBanana" label="分辨率" prop="imageSize">
                <el-select v-model="submitForm.imageSize" style="width: 120px" placeholder="分辨率">
                  <el-option
                    v-for="item in showSizeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item>
                <el-button type="primary" plain @click="applySubmitBtn">应用到所有卡片</el-button>
                <el-button type="warning" plain @click="clearTextBtn">清除所有文案</el-button>
                <el-button type="danger" plain @click="clearImagesBtn">清除所有图片</el-button>
              </el-form-item>
            </el-form>
          </div>

          <div class="operation">
            <el-button type="primary" @click="applyRequestBtn">全部开始生成</el-button>
            <el-button type="info" style="margin-left: 1em" @click="applyDownloadBtn">全部下载</el-button>
          </div>
        </div>
      </el-card>
    </div>

    <div class="task-content">
      <div class="task-item" v-for="task in taskList" :key="task.id">
        <GeminiTaskItem
          :param="submitParam"
          :task-id="task.id"
          :ref="(el) => setTaskRef(task.ref, el)"
        />
      </div>
    </div>

    <div class="add-task" @click="addTaskBtn">+ 增加任务</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import GeminiTaskItem from './components/TaskItem.vue'
import { modelOptions, ratioOptions, sizeOptions } from './js/config'

type SubmitParam = {
  modelName: string
  imageRatio: string
  imageSize: string
}

type TaskRefName = string

const submitForm = ref<SubmitParam>({
  modelName: modelOptions[0]?.value ?? 'Banana Pro',
  imageRatio: ratioOptions[0]?.value ?? '3.4',
  imageSize: sizeOptions[1]?.value ?? '4K',
})

const submitParam = ref<SubmitParam>({
  modelName: submitForm.value.modelName,
  imageRatio: submitForm.value.imageRatio,
  imageSize: submitForm.value.imageSize,
})

const taskList = ref<Array<{ id: number; ref: TaskRefName }>>([
  { id: 1, ref: 'nano-task-1' },
  { id: 2, ref: 'nano-task-2' },
  { id: 3, ref: 'nano-task-3' },
])

const taskRefs = ref<Record<TaskRefName, any>>({})

function setTaskRef(refName: TaskRefName, el: any) {
  taskRefs.value[refName] = el
}

const showRationOptions = computed(() => ratioOptions)
const showSizeOptions = computed(() => sizeOptions)
const isBasicBanana = computed(() => false)

function applySubmitBtn() {
  submitParam.value = Object.assign({}, submitForm.value)
}

function clearTextBtn() {
  for (const t of taskList.value) taskRefs.value[t.ref]?.clearTextBtn?.()
}

function clearImagesBtn() {
  for (const t of taskList.value) taskRefs.value[t.ref]?.clearImagesBtn?.()
}

function applyDownloadBtn() {
  for (const t of taskList.value) taskRefs.value[t.ref]?.downloadBtn?.()
}

function applyRequestBtn() {
  for (const t of taskList.value) taskRefs.value[t.ref]?.submitBtn?.()
}

function addTaskBtn() {
  const len = taskList.value.length
  const start = len + 1
  taskList.value.push({ id: start, ref: `nano-task-${start}` })
  taskList.value.push({ id: start + 1, ref: `nano-task-${start + 1}` })
  taskList.value.push({ id: start + 2, ref: `nano-task-${start + 2}` })
}
</script>

<style scoped>
.gemini-container {
  background: rgb(248, 250, 252);
  /* border-left: 1px solid red; */
  padding: 0.6em;
  width: 100%;
  box-sizing: border-box;
}

.gemini-header {
  top:0;
  margin-bottom: 1em;
  position: sticky;
  z-index: 9;
}

.operation {
  text-align: right;
}

.content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.task-content {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1em;
  width: 100%;
}

.task-item {
  min-width: 0;
}

.add-task {
  padding: 0.6em;
  text-align: center;
  border-radius: 0.3em;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  background: rgb(255, 255, 255);
  margin: 1em 0;
  cursor: pointer;
}

.empty-state {
  color: #999;
  text-align: center;
  font-size: 12px;
}

:deep(.el-form-item) {
  margin-bottom: 8px;
  line-height: 30px;
}

:deep(.el-card__body) {
  padding: 8px 20px;
}
</style>

