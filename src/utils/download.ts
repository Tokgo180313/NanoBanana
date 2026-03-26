export async function downloadImage(src: string, filename: string) {
  if (src.startsWith('data:')) {
    const a = document.createElement('a')
    a.href = src
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    return
  }

  try {
    const res = await fetch(src)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    const a = document.createElement('a')
    a.href = src
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}

