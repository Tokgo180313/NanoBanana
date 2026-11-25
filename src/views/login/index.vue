<script setup lang="ts">
import { ArrowRight,Lock,MagicStick,Picture,VideoCamera } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
const route=useRoute()
function login(){window.location.assign('/api/auth/login'+(sessionStorage.getItem('nb.reauthenticate')?'?reauth=1':''))}
</script>

<template>
  <main class="login-page">
    <section class="showcase" aria-label="NanoBanana 创作空间">
      <a class="wordmark" href="#/login" aria-label="NanoBanana 首页"><span class="logo-mark"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 1 2.7 8.3L23 12l-8.3 2.7L12 23l-2.7-8.3L1 12l8.3-2.7Z" /></svg></span> NanoBanana<span class="brand-label">STUDIO</span></a>
      <div class="showcase-content">
        <span class="eyebrow"><span></span> 为每一个灵感，打开更多可能</span>
        <h1>想象，即刻成真<span>让创意自由生长。</span></h1>
        <p class="intro">从脑海中的一闪而过，到眼前的惊艳之作。<br>你的下一件作品，就从这里开始。</p>
        <div class="artwork" aria-hidden="true">
          <div class="art-grid"></div><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="glass-shape shape-back"></div><div class="glass-shape shape-front"></div>
          <div class="art-spark"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 1 2.7 8.3L23 12l-8.3 2.7L12 23l-2.7-8.3L1 12l8.3-2.7Z" /></svg></div>
          <span class="art-tag tag-top"><el-icon><MagicStick /></el-icon> 灵感，无限延展</span>
          <span class="art-tag tag-bottom"><span class="tag-dot"></span> MADE WITH IMAGINATION</span>
          <span class="art-caption">YOUR NEXT BIG IDEA STARTS HERE</span>
        </div>
        <div class="capabilities"><span><el-icon><Picture /></el-icon> AI 图像创作</span><i></i><span><el-icon><VideoCamera /></el-icon> AI 视频生成</span><i></i><span><el-icon><MagicStick /></el-icon> 无限灵感</span></div>
      </div>
      <div class="showcase-footer"><span>想象力不设限，创作也是。</span><span>01 / 无限可能</span></div>
    </section>

    <section class="login-panel" aria-labelledby="login-heading">
      <div class="panel-top"><span>灵感已就位，只等你来。</span><span class="availability"><span></span> 创作空间</span></div>
      <div class="form-container">
        <div class="welcome-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 1 2.7 8.3L23 12l-8.3 2.7L12 23l-2.7-8.3L1 12l8.3-2.7Z" /></svg></div>
        <span class="form-eyebrow">WELCOME TO YOUR CREATIVE SPACE</span>
        <h2 id="login-heading">欢迎回来</h2>
        <p class="form-subtitle">登录 NanoBanana，继续你的创意旅程。</p>
        <el-alert v-if="route.query.access==='denied'" title="当前账号未获准访问图片工作台，请联系管理员。" type="warning" :closable="false" show-icon/><el-alert v-if="route.query.loggedOut" title="已退出当前浏览器的统一登录，请重新输入账号密码。" type="success" :closable="false" show-icon/><div class="sso-login"><p>使用企业统一身份登录，访问已授权的创作工具与作品。</p><button class="submit-button" type="button" @click="login">通过企业身份登录<el-icon aria-hidden="true"><ArrowRight/></el-icon></button><p class="preview-note"><el-icon aria-hidden="true"><Lock/></el-icon>任务与作品按本人或授权小组范围访问</p></div>
      </div>
      <footer class="panel-footer"><span>© {{ new Date().getFullYear() }} NanoBanana</span><span><el-icon aria-hidden="true"><Lock /></el-icon> 灵感从这里开始</span></footer>
    </section>
  </main>
</template>

<style scoped>
.sso-login{margin-top:32px}.sso-login>p:first-child{color:var(--text-muted);line-height:1.8;font-size:13px;margin-bottom:24px}

.login-page { min-height: 100svh; display: grid; grid-template-columns: 1fr 1fr; background: #fff; }
.showcase { min-width: 0; padding: 36px 48px 28px; display: flex; flex-direction: column; background: #f0effb; position: relative; overflow: hidden; }
.wordmark { display: flex; align-items: center; gap: 10px; width: fit-content; color: #28233e; text-decoration: none; font-size: 21px; font-weight: 750; letter-spacing: -.7px; }
.logo-mark { background: var(--brand); color: #fff; border-radius: 11px; width: 36px; height: 36px; display: grid; place-items: center; font-size: 29px; }
.logo-mark svg { width: 28px; height: 28px; }
.brand-label { font-size: 9px; letter-spacing: 1.5px; font-weight: 650; border: 1px solid #d1cce9; padding: 3px 5px; border-radius: 4px; margin-left: 2px; }
.showcase-content { margin: auto 0; padding-top: 54px; }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #5e5680; letter-spacing: 1px; }
.eyebrow > span, .availability > span { width: 6px; height: 6px; background: #7664d3; border-radius: 50%; }
h1 { font-size: clamp(30px, 3.1vw, 48px); letter-spacing: -1.6px; line-height: 1.4; margin-top: 22px; font-weight: 650; color: #28213e; }
h1 > span { display: block; color: #7563c7; }
.intro { margin-top: 20px; color: #726b87; font-size: 14px; line-height: 1.9; }
.artwork { position: relative; height: 300px; max-width: 480px; margin: 15px auto 4px; perspective: 700px; }
.art-grid { position: absolute; inset: 20px -30px 0; background-image: linear-gradient(#c5bee52e 1px, transparent 1px), linear-gradient(90deg,#c5bee52e 1px, transparent 1px); background-size: 36px 36px; mask-image: radial-gradient(ellipse,black,transparent 70%); transform: rotate(-12deg); }
.orbit { position: absolute; border: 1px solid #c6bce655; border-radius: 50%; width: 360px; height: 180px; left: 50%; top: 58px; transform: translateX(-50%) rotate(-28deg); }
.orbit-two { transform: translateX(-50%) rotate(32deg); }
.glass-shape { position: absolute; left: 50%; top: 36px; width: 176px; height: 205px; border-radius: 48px; border: 1px solid #ffffff9c; transform: translateX(-50%) rotate(-28deg) skew(6deg, 4deg); }
.shape-back { margin-left: -36px; background: linear-gradient(140deg,#e6ddff,#afa1e9 50%,#8974cf); box-shadow: 18px 25px 40px #8b74bd2b, inset 3px 3px 8px #fff; }
.shape-front { margin-left: 32px; top: 62px; background: linear-gradient(135deg,#ffffffa8,#c0b3ebaf 38%,#7d62caee); box-shadow: 10px 20px 30px #8265b62e,inset 2px 2px 7px #fff; backdrop-filter: blur(9px); }
.art-spark { position: absolute; top: 90px; left: 50%; color: #fcfaff; font-size: 100px; line-height: 1; transform: translateX(-20%) rotate(8deg); text-shadow: 0 2px 14px #fff8; }
.art-spark svg { width: 90px; height: 90px; }
.art-tag { position: absolute; display: flex; align-items: center; gap: 8px; background: #fffc; border: 1px solid #fff; border-radius: 10px; padding: 11px 14px; color: #625582; box-shadow: 0 8px 24px #7363910b; font-size: 11px; }
.tag-top { top: 35px; right: 0; transform: rotate(6deg); }.tag-bottom { bottom: 42px; left: 0; font-size: 8px; letter-spacing: 1.1px; transform: rotate(-5deg); }.tag-dot { width: 6px; height: 6px; background: #8c76d2; border-radius: 50%; }.art-caption { position: absolute; bottom: 9px; left: 0; right: 0; text-align: center; font-size: 8px; letter-spacing: 3px; color: #8a809f; }
.capabilities { display: flex; align-items: center; gap: 16px; justify-content: center; margin: 20px 0 38px; color: #6e6583; font-size: 11px; }.capabilities span { display: flex; gap: 6px; align-items: center; }.capabilities i:not(.el-icon) { height: 10px; width: 1px; background: #d7d1e7; }
.showcase-footer { display: flex; justify-content: space-between; color: #837994; font-size: 10px; }
.login-panel { padding: 38px 44px 28px; display: flex; flex-direction: column; min-width: 0; }.panel-top { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #8a8a98; }.availability { display: flex; gap: 7px; align-items: center; color: #68617c; }.availability > span { background: #639a7d; }
.form-container { width: 100%; max-width: 360px; margin: auto; padding: 65px 0; }.welcome-icon { background: var(--brand-soft); color: var(--brand); width: 48px; height: 48px; display: grid; place-items: center; font-size: 32px; border-radius: 14px; margin-bottom: 27px; }.welcome-icon svg { width: 32px; height: 32px; }
.form-eyebrow { font-size: 9px; letter-spacing: 1.6px; color: #878193; }h2 { font-size: 30px; letter-spacing: -1px; margin-top: 10px; }.form-subtitle { color: #7b7a89; font-size: 13px; margin-top: 10px; }form { margin-top: 34px; }.field { margin-bottom: 20px; }.field > label { display: block; font-size: 12px; color: #494557; margin-bottom: 9px; font-weight: 550; }.input-wrap { display: flex; align-items: center; gap: 11px; height: 48px; padding-left: 15px; border: 1px solid #e3e1ea; border-radius: 8px; background: #fdfdfe; color: #9993a8; transition: border-color .2s, box-shadow .2s; }.input-wrap:focus-within { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }.input-wrap input { width: 100%; min-width: 0; padding: 0 12px 0 0; height: 100%; border: 0; background: transparent; font-size: 14px; color: var(--text-h); outline: none; }.input-wrap input::placeholder { color: #9994a5; font-size: 12px; }.reveal { display: grid; place-items: center; height: 44px; width: 44px; flex-shrink: 0; border: 0; background: transparent; color: #888194; cursor: pointer; border-radius: 6px; }.form-options { display: flex; align-items: center; justify-content: space-between; margin-top: -5px; margin-bottom: 20px; font-size: 12px; }.remember { display: flex; align-items: center; cursor: pointer; min-height: 44px; gap: 6px; color: #6b6579; }.remember input { width: 15px; height: 15px; accent-color: var(--brand); }.session-hint { font-size: 10px; color: #817a8e; }.text-button { border: none; background: transparent; color: var(--brand); cursor: pointer; font-size: 12px; min-height: 44px; }.submit-button, .demo-button { width: 100%; height: 48px; border-radius: 8px; display: flex; justify-content: center; align-items: center; gap: 10px; font-size: 13px; cursor: pointer; transition: background .2s, box-shadow .2s; }.submit-button { background: var(--brand); border: 1px solid var(--brand); color: white; box-shadow: 0 4px 10px #5044e520; position: relative; }.submit-button .el-icon { position: absolute; right: 18px; }.submit-button:hover { background: var(--brand-hover); box-shadow: 0 5px 16px #5044e536; }.divider { display: flex; gap: 14px; align-items: center; color: #9992a5; font-size: 10px; margin: 26px 0 21px; }.divider::before,.divider::after { content: ''; height: 1px; background: #eeecf2; flex: 1; }.demo-button { background: white; border: 1px solid #e4e0ec; color: #5f566f; }.demo-button > span { font-size: 10px; color: #83798f; background: #f5f3f9; border-radius: 4px; padding: 2px 5px; }.demo-button:hover,.reveal:hover { background: #f7f5fd; }.preview-note { display: flex; justify-content: center; align-items: center; gap: 5px; margin-top: 17px; font-size: 10px; color: #81798d; }.panel-footer { display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #8a8494; }.panel-footer > span:last-child { display: flex; gap: 5px; align-items: center; }.field-error { font-size: 12px; color: #b42335; margin-top: 6px; }.invalid { border-color: #b42335; }.notice { padding: 12px; background: var(--brand-soft); color: #544578; border-radius: 8px; font-size: 12px; margin-top: 14px; line-height: 1.7; }
@media (min-width: 1500px) { .showcase { padding-left: 80px; padding-right: 80px; }.artwork { height: 330px; }.form-container { max-width: 390px; } }
@media (max-width: 1000px) { .showcase { padding: 30px; }.login-panel { padding: 32px; }.brand-label { display: none; }.capabilities { gap: 9px; font-size: 10px; } }
@media (max-width: 760px) { .login-page { grid-template-columns: 1fr; }.showcase { padding: 22px 24px; }.showcase-content,.showcase-footer { display: none; }.wordmark { font-size: 19px; }.brand-label { display: block; }.logo-mark { height: 32px; width: 32px; }.login-panel { padding: 24px; min-height: calc(100svh - 76px); }.panel-top { display: none; }.form-container { padding: 38px 0 48px; }.panel-footer { gap: 10px; flex-wrap: wrap; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; } }
</style>
