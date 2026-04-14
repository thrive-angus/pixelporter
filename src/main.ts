import { on, showUI, emit } from '@create-figma-plugin/utilities'

function getTopmostFrame(node: SceneNode): SceneNode {
  let current: SceneNode = node
  while (current.parent && current.parent.type !== 'PAGE') {
    current = current.parent as SceneNode
  }
  return current
}

export default function () {
  showUI({ width: 320, height: 580 })

  figma.on('selectionchange', async () => {
    const selection = figma.currentPage.selection
    if (selection.length > 0) {
      const node = selection[0]
      try {
        const previewBytes = await node.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: 1 }
        })

        const topmostFrame = getTopmostFrame(node)
        const projectName = figma.root.name
        const suggestedPath = `${projectName} - ${topmostFrame.name}`

        emit('SELECTION_PREVIEW', {
          nodeId: node.id,
          name: node.name,
          previewBytes: Array.from(previewBytes),
          fileSize: previewBytes.length,
          suggestedPath: suggestedPath
        })
      } catch (err) {
        console.error("Preview Export Failed:", err)
      }
    }
  })

  on('SEND_TO_PIPELINE', async (data: { webhookUrl: string, folderPath: string, items: any[] }) => {
    figma.notify('Exporting assets...', { timeout: 2000 })
    const assets = []

    for (const item of data.items) {
      const nodeId = item.id.split('-')[0]
      const node = figma.getNodeById(nodeId) as any

      if (node && typeof node.exportAsync === 'function') {
        try {
          const format = item.format === 'SVG' ? 'SVG' : 'PNG'
          const buffer = await node.exportAsync({
            format: format,
            constraint: { type: 'SCALE', value: 1 }
          })

          assets.push({
            name: item.name,
            buffer: buffer,
            format: format,
            customName: item.customName || ''
          })
        } catch (e) {
          console.error(`Export failed for ${nodeId}:`, e)
        }
      }
    }

    if (assets.length > 0) {
      emit('SEND_ALL_TO_N8N', {
        webhookUrl: data.webhookUrl,
        folderPath: data.folderPath,
        assets: assets
      })
    } else {
      figma.notify('No valid layers selected to export.')
    }
  })
}