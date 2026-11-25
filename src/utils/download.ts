export async function downloadImage(src: string, filename: string) {
  if(!/^\/api\/workbench\/assets\/nb-asset-[a-z0-9-]+\/preview$/.test(src))throw new Error('请从已登录账号的服务端作品中下载图片')
  const downloadUrl=src.replace(/\/preview$/,'/download')
  const res = await fetch(downloadUrl,{credentials:'same-origin',cache:'no-store'})
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)
  const blob = await res.blob()
  if (!blob.size || (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream')) {
    throw new Error('服务器未返回有效图片')
  }
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser time to consume the object URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
